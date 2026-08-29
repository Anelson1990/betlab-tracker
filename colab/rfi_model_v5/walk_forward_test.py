"""
RFI v5 — walk-forward, no-leak validation.

train_calibration.py's 3-way split proves the model wasn't fit on the
same data used to pick its threshold. This script goes further: it
re-fits repeatedly through the season (expanding window), predicts only
the next block of games each time, and pools every one of those
predictions into a single reliability report. If there's leakage
anywhere upstream — in feature timing, in how OSS computes a "rolling"
stat, in anything — it tends to show up here as suspiciously good early
folds or a Brier score too close to 0, because a real sports-betting
signal this clean does not exist.

Every fold enforces, with an assertion (not a comment, not a hope):

    max(date) over the training rows < min(date) over the test rows

so a bug that leaked a future game into a training fold fails loudly
instead of quietly inflating the report.

MODEL COMPARISON: v4 dropped XGBoost outright ("overfit, poisoning
ensemble, 0 real bets ever") without ever showing an apples-to-apples
comparison — it's entirely possible that verdict was right, but it was
never actually measured against the same walk-forward harness the
logistic calibrator gets. This script now runs the elastic-net logistic
regression (the same approach train_calibration.py fits) AND a
HistGradientBoostingClassifier through the identical folds, and prints
both pooled reports plus a head-to-head table, so "is a fancier model
worth it" gets an answer instead of an assumption. HistGradientBoosting
was picked over XGBoost specifically because it has early_stopping='auto'
built in by default (an internal validation split that halts training
once it stops improving) — the exact overfitting guard v4's XGBoost
attempt evidently lacked.

--------------------------------------------------------------------
USAGE (in Colab, after you have config.TRAIN_GAMES_FILE populated by
running run_daily.py for a while):

    python3 walk_forward_test.py

Optional flags:
    --min-train-games N   games required before the first fold (default 150)
    --step-days N         days per OOS block between refits (default 7)
    --threshold F          report pooled WR at this confidence (default:
                           uses the trained calibration bundle's
                           selected_threshold if one exists, else
                           config.BET_MIN_REAL)
    --model {logistic,gbm,both}   which model(s) to run (default: both)

SELF-TEST (no real data needed — proves the harness itself would catch
a leak, using two synthetic datasets: one with a realistic weak signal,
one with a deliberate leak injected). Runs whatever --model says, so
`--self-test --model gbm` checks that GBM alone also catches the leak:

    python3 walk_forward_test.py --self-test
--------------------------------------------------------------------
"""

import argparse
import json
import math
import random
import sys
from collections import defaultdict
from datetime import date, timedelta

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

import config
from calibration import (
    FEATURE_NAMES, build_feature_row, calibration_report, wilson_ci, brier_score,
)


# --- Data prep -------------------------------------------------------------

def load_rows(path=config.TRAIN_GAMES_FILE):
    with open(path) as f:
        rows = json.load(f)
    rows.sort(key=lambda r: r['date'])
    return rows


def rows_to_xy(rows):
    X = [build_feature_row(
        r['poi'], r['sp_prod'], r['combined'], r['lam_home'], r['lam_away'],
        r['h_nrfi'], r['a_nrfi'], r['h_fi_era'], r['a_fi_era'],
        r['ump_nrfi'], r['park_nrfi'], r['either_unproven'],
    ) for r in rows]
    y = [int(bool(r['actual_nrfi'])) for r in rows]
    return np.array(X), np.array(y)


# --- Model factories ---------------------------------------------------------
# Both take (X_train, y_train) already-scaled-or-not-as-appropriate and
# return a fitted model with .predict_proba(). Kept as plain functions
# (not classes) so a fold loop can just call model_factories[name](...).

def fit_logistic(X_train, y_train, C=0.1, l1_ratio=0.5):
    """Same family train_calibration.py fits (LogisticRegressionCV) — fixed
    hyperparameters here since re-tuning inside every walk-forward fold
    would be its own nested-CV cost for little benefit at this stage."""
    model = LogisticRegression(
        penalty='elasticnet', solver='saga', C=C, l1_ratio=l1_ratio, max_iter=3000,
    )
    model.fit(X_train, y_train)
    return model


def fit_gbm(X_train, y_train, random_state=0):
    """Deliberately regularized: shallow trees (max_leaf_nodes=15), L2
    penalty, and early_stopping='auto' (an internal validation split
    that halts once validation score stops improving) — the overfitting
    guard v4's dropped XGBoost attempt evidently didn't have. With ~13
    features and a few hundred/thousand games, a deep unconstrained
    booster would memorize noise easily; this is intentionally cautious,
    not tuned for max fit."""
    model = HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
        l2_regularization=1.0, early_stopping='auto', validation_fraction=0.15,
        n_iter_no_change=15, random_state=random_state,
    )
    model.fit(X_train, y_train)
    return model


MODEL_LABELS = {'logistic': 'logistic (elastic net)', 'gbm': 'gradient boosting (HistGBM)'}


# --- Walk-forward core ------------------------------------------------------

def walk_forward_folds(rows, min_train_games=150, step_days=7):
    """
    Yields (train_rows, test_rows, test_dates) tuples, expanding-window.
    Asserts the no-leak invariant on every fold before yielding it.
    Grouping by date (not raw row index) so a day's games always move
    together — you always know a full day's results before the next.
    """
    rows_by_date = defaultdict(list)
    for r in rows:
        rows_by_date[r['date']].append(r)
    dates = sorted(rows_by_date.keys())

    train_rows = []
    d_idx = 0
    while d_idx < len(dates) and len(train_rows) < min_train_games:
        train_rows.extend(rows_by_date[dates[d_idx]])
        d_idx += 1

    if len(train_rows) < min_train_games:
        raise ValueError(
            f'Only {len(train_rows)} games total across all dates — need at '
            f'least {min_train_games} before the first fold. Run run_daily.py '
            f'for longer before trying walk-forward validation.')

    while d_idx < len(dates):
        test_dates = dates[d_idx:d_idx + step_days]
        test_rows = [r for d in test_dates for r in rows_by_date[d]]
        d_idx += step_days
        if not test_rows:
            continue

        max_train_date = max(r['date'] for r in train_rows)
        min_test_date = min(r['date'] for r in test_rows)
        assert max_train_date < min_test_date, (
            f'LEAK DETECTED: training fold contains a date ({max_train_date}) '
            f'not strictly before the test fold\'s earliest date '
            f'({min_test_date}). This should be impossible with date-grouped '
            f'expanding folds — stop and investigate before trusting anything '
            f'downstream.')

        yield list(train_rows), test_rows, test_dates
        train_rows.extend(test_rows)


def run_walk_forward(rows, min_train_games=150, step_days=7,
                      model_name='logistic', verbose=True):
    """
    Returns (oos_records, fold_summaries).
    oos_records: pooled list of {'conf', 'won', 'date'} — every game in
    the dataset past the first fold's cutoff, predicted exactly once,
    using only data strictly before its own date.

    model_name: 'logistic' or 'gbm'. Logistic regression is scale-
    sensitive so it gets a StandardScaler fit fresh on each fold's train
    rows only; tree-based GBM splits are scale-invariant so it skips
    scaling entirely (fitting a scaler it doesn't need adds nothing but
    surface area for a bug).
    """
    oos_records = []
    fold_summaries = []

    for i, (train_rows, test_rows, test_dates) in enumerate(
            walk_forward_folds(rows, min_train_games, step_days), start=1):
        X_train, y_train = rows_to_xy(train_rows)
        X_test, y_test = rows_to_xy(test_rows)

        if model_name == 'logistic':
            scaler = StandardScaler().fit(X_train)
            model = fit_logistic(scaler.transform(X_train), y_train)
            probs = model.predict_proba(scaler.transform(X_test))[:, 1]
        elif model_name == 'gbm':
            model = fit_gbm(X_train, y_train)
            probs = model.predict_proba(X_test)[:, 1]
        else:
            raise ValueError(f"model_name must be 'logistic' or 'gbm', got {model_name!r}")

        fold_records = []
        for r, p, y_true in zip(test_rows, probs, y_test):
            conf = max(p, 1 - p)
            won = (p >= 0.5) == bool(y_true)
            rec = {'conf': conf, 'won': won, 'date': r['date']}
            oos_records.append(rec)
            fold_records.append(rec)

        wins = sum(1 for r in fold_records if r['won'])
        n = len(fold_records)
        fold_wr = wins / n if n else 0.0
        fold_summaries.append({
            'fold': i, 'train_n': len(train_rows), 'test_n': n,
            'test_start': test_dates[0], 'test_end': test_dates[-1],
            'wr': fold_wr,
        })
        if verbose:
            print(f'  Fold {i:>3}: train={len(train_rows):>5} games '
                  f'(through {max(r["date"] for r in train_rows)})  ->  '
                  f'test={n:>4} games [{test_dates[0]}..{test_dates[-1]}]  '
                  f'WR={fold_wr*100:5.1f}%')

    return oos_records, fold_summaries


# --- Reporting ---------------------------------------------------------------

def report(oos_records, fold_summaries, threshold, breakeven_wr, label=''):
    print(f'\n{"="*65}')
    print(f'  POOLED OUT-OF-SAMPLE RESULTS {label}')
    print(f'{"="*65}')
    print(f'  Total OOS predictions: {len(oos_records)} '
          f'(each game predicted exactly once, using only data strictly '
          f'before its own date)')

    b = brier_score(oos_records)
    print(f'  Pooled Brier score: {b:.4f}  (0=perfect, 0.25=coinflip-uninformative)')
    if b < 0.05:
        print('  ⚠️  Brier score this low on real sports data is a red flag for')
        print('      leakage, not a sign of a great model — investigate before trusting it.')

    print('\n  Reliability table (full confidence range):')
    calibration_report(oos_records)

    bet_records = [r for r in oos_records if r['conf'] >= threshold]
    print(f'\n  At threshold {threshold:.2f}:')
    if bet_records:
        wins = sum(1 for r in bet_records if r['won'])
        n = len(bet_records)
        wr = wins / n
        lo, hi = wilson_ci(wins, n)
        print(f'    {n} bets, {wr*100:.1f}% WR, 95% CI [{lo*100:.1f}%, {hi*100:.1f}%]')
        print(f'    Breakeven WR: {breakeven_wr*100:.1f}%')
        if lo > breakeven_wr:
            verdict = 'PASS — CI lower bound clears breakeven'
        elif hi < breakeven_wr:
            verdict = 'FAIL — CI entirely below breakeven'
        else:
            verdict = 'INCONCLUSIVE — CI straddles breakeven, need more data'
        print(f'    Verdict: {verdict}')
    else:
        print('    No OOS games reached this confidence — need more data '
              'or a lower threshold to evaluate.')

    print('\n  Per-fold stability (large swings fold-to-fold are worth digging into):')
    for f in fold_summaries:
        print(f'    fold {f["fold"]:>3}  [{f["test_start"]}..{f["test_end"]}]  '
              f'n={f["test_n"]:>4}  WR={f["wr"]*100:5.1f}%')


def head_to_head(results_by_model, threshold, breakeven_wr):
    """
    results_by_model: {model_name: oos_records}. Prints a compact
    side-by-side so "is the fancier model actually better" has a table
    to point at instead of a guess. A lower Brier score with a similar
    or larger n at threshold is a real win; a lower Brier score bought
    by betting on far fewer games is not automatically better — check n.
    """
    print(f'\n{"="*65}')
    print('  HEAD-TO-HEAD')
    print(f'{"="*65}')
    print(f"  {'Model':<26}{'Brier':>8}{'n@thr':>8}{'WR@thr':>9}{'95% CI':>18}")
    for name, oos in results_by_model.items():
        label = MODEL_LABELS.get(name, name)
        b = brier_score(oos)
        bet = [r for r in oos if r['conf'] >= threshold]
        if bet:
            wins = sum(1 for r in bet if r['won'])
            n = len(bet)
            wr = wins / n
            lo, hi = wilson_ci(wins, n)
            ci_str = f'[{lo*100:4.1f}%,{hi*100:5.1f}%]'
            wr_str = f'{wr*100:7.1f}%'
        else:
            n, wr_str, ci_str = 0, '   n/a', 'n/a'
        b_str = f'{b:.4f}' if b is not None else 'n/a'
        print(f'  {label:<26}{b_str:>8}{n:>8}{wr_str:>9}{ci_str:>18}')
    print(f'\n  Breakeven WR: {breakeven_wr*100:.1f}%')
    print('  Lower Brier + a CI that clears breakeven with n in the same')
    print('  ballpark as the other model = the more trustworthy pick. A model')
    print('  that "wins" on Brier by only clearing the threshold on a handful')
    print('  of games is not a real result yet — look at n before picking one.')


# --- Self-test: prove the harness catches a leak ----------------------------

def _synthetic_rows(n=1500, leak=False, seed=42):
    rnd = random.Random(seed)
    rows = []
    start = date(2026, 3, 27)
    for i in range(n):
        d = start + timedelta(days=i // 12)
        h_fi_era = rnd.gauss(4.3, 0.9)
        a_fi_era = rnd.gauss(4.3, 0.9)
        h_nrfi = min(0.95, max(0.05, rnd.gauss(0.51, 0.08)))
        a_nrfi = min(0.95, max(0.05, rnd.gauss(0.51, 0.08)))
        park_nrfi = min(0.9, max(0.1, rnd.gauss(0.514, 0.04)))
        ump_nrfi = min(0.9, max(0.1, rnd.gauss(0.514, 0.03)))
        lam_home = max(0.03, min(1.8, (a_fi_era / 9) * 0.7 + rnd.gauss(0, 0.05)))
        lam_away = max(0.03, min(1.8, (h_fi_era / 9) * 0.7 + rnd.gauss(0, 0.05)))
        poi = math.exp(-lam_home) * math.exp(-lam_away)
        sp_prod = max(0.05, min(0.95, h_nrfi * a_nrfi / 0.514))
        combined = max(0.05, min(0.95, poi * 0.65 + sp_prod * 0.35))
        either_unproven = rnd.random() < 0.12
        true_p = min(0.95, max(0.05, combined * 0.8 + (park_nrfi + ump_nrfi) / 2 * 0.2))
        actual_nrfi = rnd.random() < true_p

        if leak:
            # Deliberately inject the outcome into a feature the model
            # sees, to simulate what upstream leakage would look like.
            combined = 0.97 if actual_nrfi else 0.03

        rows.append({
            'date': d.isoformat(), 'poi': poi, 'sp_prod': sp_prod, 'combined': combined,
            'lam_home': lam_home, 'lam_away': lam_away,
            'h_nrfi': h_nrfi, 'a_nrfi': a_nrfi, 'h_fi_era': h_fi_era, 'a_fi_era': a_fi_era,
            'ump_nrfi': ump_nrfi, 'park_nrfi': park_nrfi, 'either_unproven': either_unproven,
            'actual_nrfi': actual_nrfi,
        })
    return rows


def self_test(models):
    print('=' * 65)
    print('  SELF-TEST: does this harness actually catch a leak?')
    print(f'  Model(s): {", ".join(models)}')
    print('=' * 65)
    breakeven = config.STAKE / (config.STAKE + config.PAYOUT)

    clean_rows = _synthetic_rows(leak=False)
    leaked_rows = _synthetic_rows(leak=True)

    clean_briers, leaked_briers = {}, {}
    for model_name in models:
        label = MODEL_LABELS[model_name]

        print(f'\n--- Dataset A ({label}): realistic, weak, noisy signal (no leak) ---')
        oos, folds = run_walk_forward(clean_rows, min_train_games=150, step_days=10,
                                       model_name=model_name, verbose=False)
        report(oos, folds, threshold=0.55, breakeven_wr=breakeven,
               label=f'(clean synthetic data, {label})')
        clean_briers[model_name] = brier_score(oos)

        print(f'\n\n--- Dataset B ({label}): same generator, outcome leaked into a feature ---')
        oos2, folds2 = run_walk_forward(leaked_rows, min_train_games=150, step_days=10,
                                         model_name=model_name, verbose=False)
        report(oos2, folds2, threshold=0.55, breakeven_wr=breakeven,
               label=f'(LEAKED synthetic data, {label})')
        leaked_briers[model_name] = brier_score(oos2)

    print(f'\n{"="*65}')
    print('  SELF-TEST VERDICT')
    print(f'{"="*65}')
    all_ok = True
    for model_name in models:
        b_clean, b_leaked = clean_briers[model_name], leaked_briers[model_name]
        label = MODEL_LABELS[model_name]
        print(f'  {label}: clean Brier {b_clean:.4f} (expect ~0.25)  |  '
              f'leaked Brier {b_leaked:.4f} (expect ~0.0)')
        if not (b_leaked < 0.10 and b_clean > 0.20):
            all_ok = False

    if all_ok:
        print('\n  PASS — every model tested clearly distinguishes a leaked pipeline')
        print('  from a clean one. If a real run ever looks like the leaked numbers')
        print('  above, that is a leakage red flag, not a model to bet on.')
    else:
        print('\n  UNEXPECTED — at least one model did not separate the two datasets')
        print('  as expected. Do not trust this harness until that\'s understood.')
        sys.exit(1)


# --- CLI ---------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__.split('---')[0])
    parser.add_argument('--min-train-games', type=int, default=150)
    parser.add_argument('--step-days', type=int, default=7)
    parser.add_argument('--threshold', type=float, default=None)
    parser.add_argument('--model', choices=['logistic', 'gbm', 'both'], default='both')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()

    models = ['logistic', 'gbm'] if args.model == 'both' else [args.model]

    if args.self_test:
        self_test(models)
        return

    print('=' * 65)
    print('  RFI v5 — WALK-FORWARD, NO-LEAK VALIDATION')
    print('=' * 65)

    try:
        rows = load_rows()
    except FileNotFoundError:
        print(f'\n  No training file at {config.TRAIN_GAMES_FILE}.')
        print('  Run run_daily.py for a while first (it auto-exports this file),')
        print('  or run `python3 walk_forward_test.py --self-test` to validate the')
        print('  harness itself with synthetic data instead.')
        sys.exit(1)

    print(f'\n  Loaded {len(rows)} games ({rows[0]["date"]} .. {rows[-1]["date"]})')
    print(f'  min_train_games={args.min_train_games}  step_days={args.step_days}  '
          f'model(s)={", ".join(models)}')

    threshold = args.threshold
    if threshold is None:
        try:
            from calibration import load_calibration_bundle
            bundle = load_calibration_bundle(config.CAL_FILE)
            threshold = bundle['selected_threshold'] if bundle else config.BET_MIN_REAL
        except Exception:
            threshold = config.BET_MIN_REAL
    print(f'  Reporting threshold: {threshold:.2f}\n')

    breakeven = config.STAKE / (config.STAKE + config.PAYOUT)
    results_by_model = {}
    for model_name in models:
        print(f'\n>>> Fitting {MODEL_LABELS[model_name]} through each fold...')
        oos_records, fold_summaries = run_walk_forward(
            rows, min_train_games=args.min_train_games, step_days=args.step_days,
            model_name=model_name)
        report(oos_records, fold_summaries, threshold, breakeven,
               label=f'({MODEL_LABELS[model_name]})')
        results_by_model[model_name] = oos_records

    if len(results_by_model) > 1:
        head_to_head(results_by_model, threshold, breakeven)


if __name__ == '__main__':
    main()
