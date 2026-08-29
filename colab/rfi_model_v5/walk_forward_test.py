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

SELF-TEST (no real data needed — proves the harness itself would catch
a leak, using two synthetic datasets: one with a realistic weak signal,
one with a deliberate leak injected):

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
                      fixed_C=0.1, fixed_l1_ratio=0.5, verbose=True):
    """
    Returns (oos_records, fold_summaries).
    oos_records: pooled list of {'conf', 'won', 'date'} — every game in
    the dataset past the first fold's cutoff, predicted exactly once,
    using only data strictly before its own date.
    """
    oos_records = []
    fold_summaries = []

    for i, (train_rows, test_rows, test_dates) in enumerate(
            walk_forward_folds(rows, min_train_games, step_days), start=1):
        X_train, y_train = rows_to_xy(train_rows)
        X_test, y_test = rows_to_xy(test_rows)

        scaler = StandardScaler().fit(X_train)
        model = LogisticRegression(
            penalty='elasticnet', solver='saga', C=fixed_C,
            l1_ratio=fixed_l1_ratio, max_iter=3000,
        )
        model.fit(scaler.transform(X_train), y_train)

        probs = model.predict_proba(scaler.transform(X_test))[:, 1]
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


def self_test():
    print('=' * 65)
    print('  SELF-TEST: does this harness actually catch a leak?')
    print('=' * 65)
    breakeven = config.STAKE / (config.STAKE + config.PAYOUT)

    print('\n--- Dataset A: realistic, weak, noisy signal (no leak) ---')
    clean_rows = _synthetic_rows(leak=False)
    oos, folds = run_walk_forward(clean_rows, min_train_games=150, step_days=10, verbose=False)
    report(oos, folds, threshold=0.55, breakeven_wr=breakeven, label='(clean synthetic data)')
    b_clean = brier_score(oos)

    print('\n\n--- Dataset B: same generator, outcome leaked into a feature ---')
    leaked_rows = _synthetic_rows(leak=True)
    oos2, folds2 = run_walk_forward(leaked_rows, min_train_games=150, step_days=10, verbose=False)
    report(oos2, folds2, threshold=0.55, breakeven_wr=breakeven, label='(LEAKED synthetic data)')
    b_leaked = brier_score(oos2)

    print(f'\n{"="*65}')
    print('  SELF-TEST VERDICT')
    print(f'{"="*65}')
    print(f'  Clean dataset Brier:  {b_clean:.4f}  (expected: close to 0.25, no real edge)')
    print(f'  Leaked dataset Brier: {b_leaked:.4f}  (expected: near 0.0, obviously "too good")')
    if b_leaked < 0.10 and b_clean > 0.20:
        print('\n  PASS — the harness clearly distinguishes a leaked pipeline from a')
        print('  clean one. If your real run ever looks like Dataset B\'s numbers,')
        print('  that is a leakage red flag, not a model to bet on.')
    else:
        print('\n  UNEXPECTED — the two datasets did not separate as expected. Do not')
        print('  trust this harness until that\'s understood.')
        sys.exit(1)


# --- CLI ---------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__.split('---')[0])
    parser.add_argument('--min-train-games', type=int, default=150)
    parser.add_argument('--step-days', type=int, default=7)
    parser.add_argument('--threshold', type=float, default=None)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()

    if args.self_test:
        self_test()
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
    print(f'  min_train_games={args.min_train_games}  step_days={args.step_days}')

    threshold = args.threshold
    if threshold is None:
        try:
            from calibration import load_calibration_bundle
            bundle = load_calibration_bundle(config.CAL_FILE)
            threshold = bundle['selected_threshold'] if bundle else config.BET_MIN_REAL
        except Exception:
            threshold = config.BET_MIN_REAL
    print(f'  Reporting threshold: {threshold:.2f}\n')

    oos_records, fold_summaries = run_walk_forward(
        rows, min_train_games=args.min_train_games, step_days=args.step_days)

    breakeven = config.STAKE / (config.STAKE + config.PAYOUT)
    report(oos_records, fold_summaries, threshold, breakeven)


if __name__ == '__main__':
    main()
