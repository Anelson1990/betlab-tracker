"""
RFI v5 — calibration diagnostics + applying a fitted calibration model.

Fitting happens in train_calibration.py (offline, walk-forward, its own
held-out fold). This module only *applies* a saved model live and
reports how well predictions matched reality — it never fits anything
itself, so it can't leak train data into what it reports.
"""

import math
import pickle


FEATURE_NAMES = [
    'poi', 'sp_prod', 'combined', 'lam_home', 'lam_away', 'lam_sum',
    'h_nrfi', 'a_nrfi', 'h_fi_era', 'a_fi_era',
    'ump_nrfi', 'park_nrfi', 'either_unproven',
]


def build_feature_row(poi, sp_prod, combined, lam_home, lam_away,
                       h_nrfi, a_nrfi, h_fi_era, a_fi_era,
                       ump_nrfi, park_nrfi, either_unproven):
    return [
        poi, sp_prod, combined, lam_home, lam_away, lam_home + lam_away,
        h_nrfi, a_nrfi, h_fi_era, a_fi_era,
        ump_nrfi, park_nrfi, int(either_unproven),
    ]


def load_calibration_bundle(path):
    """Returns the pickle dict, or None if no calibration has been trained yet."""
    try:
        with open(path, 'rb') as f:
            return pickle.load(f)
    except FileNotFoundError:
        return None


def apply_calibration(bundle, feature_row, fallback_prob):
    """
    bundle: dict from load_calibration_bundle(), or None.
    fallback_prob: the raw `combined` probability to use when no
    calibration model exists yet (matches v4's ungated behaviour, so the
    pipeline still runs before you've ever trained a calibrator).
    """
    if bundle is None:
        return fallback_prob
    X = bundle['scaler'].transform([feature_row])
    return float(bundle['model'].predict_proba(X)[0][1])


# --- Diagnostics ---------------------------------------------------------

def wilson_ci(wins, n, z=1.96):
    """95% Wilson score interval — stays sane at small n, unlike a normal approx."""
    if n == 0:
        return (0.0, 0.0)
    phat = wins / n
    denom = 1 + z ** 2 / n
    center = phat + z ** 2 / (2 * n)
    margin = z * math.sqrt(phat * (1 - phat) / n + z ** 2 / (4 * n ** 2))
    return ((center - margin) / denom, (center + margin) / denom)


def brier_score(records):
    """records: iterable of {'conf': float, 'won': bool}. Lower is better; 0=perfect."""
    records = list(records)
    if not records:
        return None
    return sum((r['conf'] - int(r['won'])) ** 2 for r in records) / len(records)


def calibration_report(records, buckets=(0.50, 0.55, 0.60, 0.62, 0.65, 0.70, 0.80, 1.01),
                        min_n_for_flag=15, print_output=True):
    """
    records: iterable of {'conf': float, 'won': bool}, ideally covering
    the FULL confidence range (not just bet-tier picks — see
    tracking.grade_all_games) so mid/low-confidence calibration is
    actually visible, not just the high end you bet on.

    Returns the bucket rows as data (for programmatic use) even when
    print_output=True also prints them.
    """
    records = list(records)
    rows = []
    if not records:
        if print_output:
            print('  No graded records yet.')
        return rows

    for lo, hi in zip(buckets[:-1], buckets[1:]):
        in_bucket = [r for r in records if lo <= r['conf'] < hi]
        if not in_bucket:
            continue
        n = len(in_bucket)
        wins = sum(1 for r in in_bucket if r['won'])
        actual_wr = wins / n
        avg_pred = sum(r['conf'] for r in in_bucket) / n
        lo_ci, hi_ci = wilson_ci(wins, n)
        rows.append({
            'lo': lo, 'hi': hi, 'n': n, 'pred_avg': avg_pred,
            'actual_wr': actual_wr, 'ci_lo': lo_ci, 'ci_hi': hi_ci,
        })

    if print_output:
        print(f"\n  {'Bucket':<12}{'n':>5}{'Pred avg':>10}{'Actual WR':>11}{'95% CI':>18}   Gap")
        for row in rows:
            gap = row['actual_wr'] - row['pred_avg']
            flag = ''
            if row['n'] >= min_n_for_flag:
                if gap < -0.05:
                    flag = '  <-- overconfident'
                elif gap > 0.05:
                    flag = '  <-- underconfident'
            hi_label = f"{row['hi']:.2f}" if row['hi'] <= 1.0 else '1.00+'
            print(f"  [{row['lo']:.2f},{hi_label})  {row['n']:>4}"
                  f"{row['pred_avg']*100:>9.1f}%{row['actual_wr']*100:>10.1f}%"
                  f"   [{row['ci_lo']*100:5.1f}%,{row['ci_hi']*100:5.1f}%]{flag}")
        b = brier_score(records)
        print(f"\n  Brier score: {b:.4f}  (0=perfect, 0.25=coinflip-uninformative)")

    return rows
