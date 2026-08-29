"""
RFI v5 — offline calibration training.

Run this separately from run_daily.py, whenever you've accumulated a new
batch of graded games (config.TRAIN_GAMES_FILE). It is NOT part of the
daily pipeline on purpose: fitting and daily prediction must stay
decoupled so daily runs can't accidentally retrain on data that includes
today's own picks.

Fixes vs. v4's (unseen, but implied by its "OOS edge" comment) approach:

  1. THREE-WAY CHRONOLOGICAL SPLIT, not one train/test split.
     - fit fold (70%):        fits the elastic-net calibrator
     - threshold fold (15%):  picks the bet threshold
     - holdout fold (15%):    reports the number you actually trust
     A threshold chosen on the same data used to fit the model (or the
     same data used to report "OOS edge") is optimistic by construction
     — see the two overlapping-CI backtest tiers from the v4 review.
     Here, no fold is used for two purposes.

  2. CHRONOLOGICAL, not random. Team/pitcher rolling stats are
     autocorrelated in time; a random split lets the model implicitly
     see "nearby" games in training that share the same underlying
     hot/cold streak as a test game, inflating apparent skill. Splitting
     by date order is the closest thing to how it'll actually be used
     (predict games you haven't seen yet).

  3. Threshold is chosen by MAXIMIZING EXPECTED ROI on the threshold
     fold, not just maximizing win rate — a 90% WR threshold with 4 bets
     is worse than a 66% WR threshold with 200 bets for actually making
     money, and ROI (not WR) is what you're trying to optimize.

  4. Reports a genuine holdout reliability table (calibration.py), not
     just a point WR estimate, and prints Wilson CIs everywhere so small
     samples don't get mistaken for precision.

Expected input (config.TRAIN_GAMES_FILE): a JSON list of dicts, one per
graded historical game, each shaped like the feature row this model
uses at prediction time, plus ground truth:

    {
      "date": "2026-04-03",
      "poi": 0.44, "sp_prod": 0.51, "combined": 0.47,
      "lam_home": 0.42, "lam_away": 0.39,
      "h_nrfi": 0.55, "a_nrfi": 0.52,
      "h_fi_era": 3.8, "a_fi_era": 4.1,
      "ump_nrfi": 0.50, "park_nrfi": 0.51,
      "either_unproven": false,
      "actual_nrfi": true
    }

You build this file up over a season by appending each day's
`all_games_data` (from run_daily.py) once it's graded — see
tracking.export_training_rows(). There's no shortcut around needing
real historical games; a calibrator fit on a handful of days is not
going to be trustworthy no matter how the split is done.
"""

import argparse
import json
import sys
from datetime import datetime

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegressionCV
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
import pickle

from config import CAL_FILE, TRAIN_GAMES_FILE, STAKE, PAYOUT
from calibration import FEATURE_NAMES, build_feature_row, calibration_report, wilson_ci

BREAKEVEN_WR = STAKE / (STAKE + PAYOUT)


def fit_model(model_type, X_fit_s, y_fit):
    """
    Returns a fitted model. 'logistic' tunes C/l1_ratio via
    TimeSeriesSplit-CV (LogisticRegressionCV) since that's cheap to do
    once here. 'gbm' uses the SAME fixed, deliberately-regularized
    hyperparameters validated in walk_forward_test.py's fit_gbm — reusing
    an untested new hyperparameter search here would make the live model
    something walk_forward_test.py never actually evaluated.
    """
    if model_type == 'logistic':
        # NOTE: on sklearn >= 1.8 this prints a FutureWarning that
        # `penalty=` is redundant once l1_ratios is a list of floats —
        # harmless, the fit is correct either way; left explicit for
        # compatibility with older sklearn where it's required.
        model = LogisticRegressionCV(
            Cs=10, cv=TimeSeriesSplit(n_splits=5), penalty='elasticnet',
            solver='saga', l1_ratios=[0.1, 0.5, 0.9], max_iter=5000,
            scoring='neg_brier_score',
        )
        model.fit(X_fit_s, y_fit)
        print(f'  Chosen C: {model.C_[0]:.4f}  |  l1_ratio: {model.l1_ratio_[0]:.2f}')
        return model
    elif model_type == 'gbm':
        model = HistGradientBoostingClassifier(
            max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
            l2_regularization=1.0, early_stopping='auto', validation_fraction=0.15,
            n_iter_no_change=15, random_state=0,
        )
        model.fit(X_fit_s, y_fit)
        print(f'  Fitted HistGradientBoostingClassifier '
              f'({model.n_iter_ if hasattr(model, "n_iter_") else "?"} iterations)')
        return model
    else:
        raise ValueError(f"model_type must be 'logistic' or 'gbm', got {model_type!r}")


def load_training_rows(path=TRAIN_GAMES_FILE):
    with open(path) as f:
        rows = json.load(f)
    rows.sort(key=lambda r: r['date'])
    return rows


def rows_to_xy(rows):
    X, y = [], []
    for r in rows:
        X.append(build_feature_row(
            r['poi'], r['sp_prod'], r['combined'], r['lam_home'], r['lam_away'],
            r['h_nrfi'], r['a_nrfi'], r['h_fi_era'], r['a_fi_era'],
            r['ump_nrfi'], r['park_nrfi'], r['either_unproven'],
        ))
        y.append(int(bool(r['actual_nrfi'])))
    return np.array(X), np.array(y)


def chronological_split(rows, fit_frac=0.70, threshold_frac=0.15):
    n = len(rows)
    fit_end = int(n * fit_frac)
    thresh_end = fit_end + int(n * threshold_frac)
    return rows[:fit_end], rows[fit_end:thresh_end], rows[thresh_end:]


def pick_threshold_by_expected_roi(probs, outcomes, min_n=20,
                                    candidates=np.arange(0.52, 0.85, 0.01)):
    """
    probs: calibrated P(NRFI) per threshold-fold game.
    outcomes: actual NRFI bool per game, same order.
    A "pick" here is always the side the model favors (prob>0.5 -> NRFI,
    else YRFI), so correctness is (prob>0.5) == outcome.
    Returns (best_threshold, diagnostics_dict).
    """
    best_t, best_ev, best_stats = None, -1e9, None
    for t in candidates:
        picks_idx = [i for i, p in enumerate(probs) if max(p, 1 - p) >= t]
        n = len(picks_idx)
        if n < min_n:
            continue
        wins = 0
        for i in picks_idx:
            picked_nrfi = probs[i] >= 0.5
            wins += int(picked_nrfi == outcomes[i])
        wr = wins / n
        ev_per_bet = wr * PAYOUT - (1 - wr) * STAKE
        total_ev = ev_per_bet * n
        if total_ev > best_ev:
            best_t, best_ev, best_stats = t, total_ev, {
                'n': n, 'wins': wins, 'wr': wr, 'ev_per_bet': ev_per_bet,
                'total_ev': total_ev,
            }
    return best_t, best_stats


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', choices=['logistic', 'gbm'], default='logistic')
    args = parser.parse_args()

    print('=' * 65)
    print(f'  RFI v5 — CALIBRATION TRAINING ({args.model})')
    print('=' * 65)

    try:
        rows = load_training_rows()
    except FileNotFoundError:
        print(f'\n  No training file at {TRAIN_GAMES_FILE}.')
        print('  Build it up with tracking.export_training_rows() as games get graded.')
        sys.exit(1)

    n = len(rows)
    print(f'\n  Loaded {n} graded games '
          f'({rows[0]["date"]} .. {rows[-1]["date"]})')
    if n < 200:
        print('  WARNING: under 200 games. A 3-way split leaves very little')
        print('  per fold — treat any result here as provisional, not a threshold')
        print('  to bet real money on yet.')

    fit_rows, thresh_rows, holdout_rows = chronological_split(rows)
    print(f'  Fit fold: {len(fit_rows)}  |  Threshold fold: {len(thresh_rows)}'
          f'  |  Holdout fold: {len(holdout_rows)}')

    X_fit, y_fit = rows_to_xy(fit_rows)
    X_thresh, y_thresh = rows_to_xy(thresh_rows)
    X_holdout, y_holdout = rows_to_xy(holdout_rows)

    scaler = StandardScaler().fit(X_fit)
    X_fit_s = scaler.transform(X_fit)
    # Scaling is applied regardless of model_type: required for logistic,
    # harmless for GBM (tree splits are invariant to a monotonic
    # per-feature transform) — keeps one code path for both, and means
    # apply_calibration() in calibration.py needs zero changes either way.

    print(f'\n  Fitting {args.model} calibrator...')
    model = fit_model(args.model, X_fit_s, y_fit)

    # --- Threshold selection (its own fold, never seen by the fit above) ---
    X_thresh_s = scaler.transform(X_thresh)
    probs_thresh = model.predict_proba(X_thresh_s)[:, 1]
    threshold, thresh_stats = pick_threshold_by_expected_roi(
        probs_thresh, y_thresh.astype(bool))

    if threshold is None:
        print('\n  Could not find a threshold with enough bets in the threshold '
              'fold — need more training data before this is usable.')
        sys.exit(1)

    lo_ci, hi_ci = wilson_ci(thresh_stats['wins'], thresh_stats['n'])
    print(f'\n  Selected threshold: {threshold:.2f}')
    print(f'    Threshold-fold performance: {thresh_stats["n"]} bets, '
          f'{thresh_stats["wr"]*100:.1f}% WR, 95% CI [{lo_ci*100:.1f}%, {hi_ci*100:.1f}%], '
          f'EV/bet ${thresh_stats["ev_per_bet"]:.2f}')

    # --- Final, honest number: holdout fold, never used for fitting OR
    # threshold selection ---
    X_holdout_s = scaler.transform(X_holdout)
    probs_holdout = model.predict_proba(X_holdout_s)[:, 1]
    holdout_records = [{'conf': max(p, 1 - p), 'won': (p >= 0.5) == bool(o)}
                        for p, o in zip(probs_holdout, y_holdout)]

    bet_records = [r for r in holdout_records if r['conf'] >= threshold]
    if bet_records:
        wins = sum(1 for r in bet_records if r['won'])
        holdout_wr = wins / len(bet_records)
        holdout_lo, holdout_hi = wilson_ci(wins, len(bet_records))
    else:
        holdout_wr, holdout_lo, holdout_hi = None, None, None

    print(f'\n  === TRUE HOLDOUT (never used for fitting or threshold choice) ===')
    if bet_records:
        print(f'    At threshold {threshold:.2f}: {len(bet_records)} bets, '
              f'{holdout_wr*100:.1f}% WR, 95% CI [{holdout_lo*100:.1f}%, {holdout_hi*100:.1f}%]')
        print(f'    Breakeven WR at current odds: {BREAKEVEN_WR*100:.1f}%')
        if holdout_lo < BREAKEVEN_WR:
            print('    ⚠️  Lower bound of the holdout CI is BELOW breakeven — '
                  'do not trust this threshold with real money yet.')
    else:
        print('    No holdout games cleared the chosen threshold — holdout fold '
              'too small to validate at this confidence level.')

    print('\n  Full holdout reliability table (ALL holdout games, not just bet-tier):')
    calibration_report(holdout_records)

    oos_edge = (holdout_wr - BREAKEVEN_WR) if holdout_wr is not None else None

    bundle = {
        'model': model,
        'model_type': args.model,
        'scaler': scaler,
        'feature_names': FEATURE_NAMES,
        'trained_date': datetime.now().strftime('%Y-%m-%d'),
        'n_training': len(fit_rows),
        'n_threshold_fold': len(thresh_rows),
        'n_holdout': len(holdout_rows),
        'selected_threshold': float(threshold),
        'holdout_wr': holdout_wr,
        'holdout_ci': (holdout_lo, holdout_hi) if holdout_wr is not None else None,
        'oos_edge': oos_edge,
    }
    with open(CAL_FILE, 'wb') as f:
        pickle.dump(bundle, f)
    print(f'\n  Saved calibration bundle -> {CAL_FILE}')
    print(f'  IMPORTANT: use selected_threshold ({threshold:.2f}) as your live bet')
    print('  threshold going forward — it was chosen on real held-out data, not')
    print('  picked by eye off backtest tiers.')


if __name__ == '__main__':
    main()
