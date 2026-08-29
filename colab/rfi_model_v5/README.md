# RFI v5

A rebuild of the v4 NRFI/RFI Colab notebook, split into separate,
testable files instead of one script. Same data sources (MLB Stats API +
oddlyspecificstats.com), same Poisson-plus-calibration approach — the
changes are about correctness and honesty of the numbers, not a new
strategy.

## What changed from v4, and why

**1. Real bets and paper-tracking win% are now fully separate.**
v4 kept `roi['paper']` as a *superset* of `roi['real']` (every real bet
was also counted in paper) and additionally kept a legacy top-level
`roi['total']/['wins']/['profit']` that blended both together on every
grading pass. It was easy to end up looking at a number that quietly
mixed real-money and paper-only outcomes.

v5 has three independent JSON files:
- `rfi_v5_real_tracking.json` — confidence ≥ real threshold, real money
- `rfi_v5_paper_tracking.json` — paper band only (mutually exclusive
  with real, not a superset)
- `rfi_v5_all_graded.json` — every graded game regardless of tier; this
  is a **calibration diagnostic log, not a betting record** (no win%/
  profit ever reported from it), and it doubles as the training set for
  `train_calibration.py`.

See `tracking.py`.

**2. Team offense/defense stat: EWMA + shrinkage, not a hard last-15 window.**
v4 took a flat mean of the last 15 games. Two problems: a game's
influence disappears from 100% to 0% the instant it rolls out of the
window (discontinuous), and there's no shrinkage — an 8-game-old team
stat gets treated with the same confidence as a 150-game one, unlike the
pitcher NRFI% stat in the same model, which already did shrink properly.

v5 uses an exponentially-weighted mean (half-life ~10 games, so nothing
drops off a cliff) blended toward league average with the same Bayesian
shrinkage idea already used for pitchers. Early season, a team's rate is
mostly league average; by ~30+ games it's mostly its own recent rate.
See `features.team_fi_rate()`.

**3. The 62%/65% threshold split wasn't statistically real.**
Checked the v4 backtest numbers: ≥62% (398 bets, 70.9% WR) and ≥65% (271
bets, 73.1% WR) have 95% Wilson CIs of [66.2%, 75.1%] and [67.5%, 78.0%]
— they almost fully overlap. Picking 65% as "the real-money tier because
it backtested higher" is choosing between two numbers that aren't
distinguishable from noise at that sample size.

v5's `train_calibration.py` picks the threshold on a chronological fold
that the calibrator was never fit on, then reports performance on a
*third*, still-separate holdout fold — so the number you finally see was
never used to fit anything or to pick anything. See the docstring at the
top of that file for the full reasoning.

**4. Every graded game gets logged, not just the ones you bet.**
v4 only graded games that met the paper threshold, so there was no way
to check whether 40–60% confidence predictions meant what they said —
you were only ever looking at the top of the range. v5's
`grade_completed_games()` logs every game into `rfi_v5_all_graded.json`,
which is what makes `calibration.calibration_report()` a real reliability
curve instead of one aggregate number for the range you already trust.

**5. Dedup by `game_pk`, not by date+matchup string.**
v4's dedup key was `f'{date}|{matchup}|{pick}'`. A doubleheader produces
the same matchup string twice on the same date — that key would treat
the second game as an already-graded duplicate of the first. v5 uses
MLB's own `gamePk`, which is unique per game.

## Files

| File | What it is |
|---|---|
| `config.py` | every constant/path/threshold, one place |
| `data_sources.py` | all network I/O (MLB Stats API, OSS API, wttr.in) |
| `features.py` | pure feature math — no network calls, unit-testable |
| `poisson_model.py` | lambda calc, Poisson NRFI probability, combination |
| `calibration.py` | apply a fitted calibrator + reliability/Brier/Wilson diagnostics |
| `train_calibration.py` | **offline**, run manually — 3-way chronological split, fits the elastic-net calibrator, picks the threshold, reports a genuine holdout number |
| `walk_forward_test.py` | **offline**, run manually — expanding-window walk-forward validation across the whole season, pools every out-of-sample prediction, asserts the no-leak invariant every fold |
| `tracking.py` | real/paper/all-graded stores, kept separate, `game_pk` dedup |
| `run_daily.py` | the Colab entrypoint — run this daily |
| `test_core_math.py` | offline unit tests, no network/Colab/sklearn needed |

## Running it

**First time / no calibration model yet:**
`run_daily.py` works without a trained calibrator — it just uses the raw
`combined` (Poisson × 0.65 + SP-product × 0.35) probability, same as v4
before its own calibration layer existed. It'll say so in the output.

1. Run `run_daily.py` daily for a while (a few weeks minimum, ideally a
   couple months) to build up `rfi_v5_all_graded.json`. It auto-exports
   `rfi_v5_training_games.json` from that log on every run.
2. Once you have a few hundred graded games, run `train_calibration.py`
   (in Colab, or locally with `pip install numpy scikit-learn` and the
   Drive-mounted path adjusted). It prints a full diagnostic — fit fold
   size, threshold-fold performance, and the true holdout reliability
   table — and saves `rfi_v5_calibration.pkl`.
3. `run_daily.py` will pick up the calibration bundle automatically next
   run, and will use `selected_threshold` from training as the live real-
   money cutoff instead of the static `config.BET_MIN_REAL`.
4. Re-run `train_calibration.py` periodically (e.g. monthly) as more
   games get graded — it always re-derives the threshold from a fresh
   holdout, it never just keeps the old one.

**Walk-forward, no-leak validation** (a stronger check than
`train_calibration.py`'s single 3-way split — this re-fits repeatedly
through the season and pools every out-of-sample prediction into one
report):

```bash
python3 walk_forward_test.py
```

Expanding-window: starts with the first `--min-train-games` games
(default 150), predicts the next `--step-days` days (default 7) using
only data strictly before them, then folds those days into training and
repeats through the rest of the season. Every fold asserts
`max(train date) < min(test date)` before it's allowed to run — that
invariant is actually structurally guaranteed by the date-sorted,
expanding-window construction (a bug would have to break the fold
construction itself to trip it), but the assertion stays in as a loud
failure instead of a silent one if that ever changes. Prints per-fold
win rate (watch for suspiciously large swings or a suspiciously *good*
early fold — both are leak smells) plus the same pooled reliability
table and Wilson CIs as `train_calibration.py`'s holdout report.

Run `python3 walk_forward_test.py --self-test` first (no real data
needed) — it runs the exact same harness against two synthetic datasets,
one with a realistic weak signal and one with the actual outcome leaked
into a feature, and prints both reports side by side. On this repo's
run: clean data scored a Brier of 0.251 (~coinflip-uninformative, fold
WRs bouncing 46–59% with no consistent edge — expected for a synthetic
dataset with only a faint signal) versus 0.002 and 100% WR every single
fold on the leaked data. That's the calibration for what a real leak
looks like in this report's output — if a real run ever produces numbers
that clean, it means an upstream feature has already seen the answer,
not that the model got good.

**Model comparison: logistic regression vs. gradient boosting.**
`walk_forward_test.py` also fits a `HistGradientBoostingClassifier`
through the identical folds as the elastic-net logistic regression
(`--model both`, the default; use `--model logistic` or `--model gbm` to
run just one) and prints a head-to-head table. v4's header dropped
XGBoost outright ("overfit, poisoning ensemble, 0 real bets ever")
without ever measuring it against the same walk-forward harness the
logistic model gets — this makes that an actual measurement instead of
an assumption.

On the self-test's synthetic weak-signal dataset here, GBM scored a
Brier of **0.316 — worse than the 0.25 coinflip-uninformative
baseline** — with most confidence buckets flagged overconfident and a
pooled WR of 47.3% at the 0.55 threshold (below breakeven), despite
`early_stopping='auto'` and L2 regularization. Logistic regression
stayed close to 0.25 on the same data. That's a real, reproduced
instance of the overfitting failure mode v4 flagged for XGBoost — with
only 13 features and a few hundred rows per fold, a boosted-tree model
has room to fit noise that a more heavily regularized linear model
resists. Both models correctly caught the leaked dataset (GBM even more
starkly: Brier 0.0000).

This isn't a verdict that GBM can never work here — it's evidence that,
on the data volumes realistic for this project, it needs to *earn* a
spot over the simpler model by beating it in the head-to-head table on
your actual graded games, not be added on the assumption that more
complexity helps.

**Testing without touching real data at all:**
```bash
cd colab/rfi_model_v5
python3 test_core_math.py
```
21 unit tests covering the shrinkage math, Poisson bounds, wind-boost
logic, Wilson CIs, Brier score, calibration-report bucketing, and the
tracking tier/dedup logic — all synthetic, no network or Colab needed.
This was run and passing before these files were committed.

`train_calibration.py` was also run end-to-end against a synthetic
1500-game dataset with a deliberately weak, noisy signal, to confirm the
pipeline doesn't manufacture false confidence out of noise — it
correctly reported a threshold whose holdout CI dipped below breakeven
and flagged it rather than declaring an edge. That's the behavior you
want to see: on real data with a real signal it should report something
tighter and above breakeven; if it doesn't, believe the report, not the
model.

## What this doesn't fix

This is a template, not a finished, profitable model. In particular:
- The core feature *sources* (OSS FI-specific stats, MLB Stats API) are
  unchanged — if there's leakage in *how OSS computes* a stat (e.g. it
  isn't truly point-in-time), no amount of downstream calibration fixes
  that. The v4 header's own "~2-3pp optimism bias from OSS data leakage"
  note still applies until verified against OSS's methodology directly.
- `calc_lambda()`'s specific coefficients (0.70/0.30 ERA blend, 0.35 off
  adjustment, etc.) are carried over from v4 unchanged. They were never
  fit — they're hand-picked. That's fine as a starting lambda, but the
  elastic-net calibration layer is doing real work correcting for it,
  which is exactly what it's for.
- Sample size. Even a "clean" holdout report needs real games to be
  trustworthy — a 50-bet holdout has wide Wilson CIs no matter how
  carefully the split was done. Keep the "≥50 real bets before trusting
  it" discipline from v4; v5 just makes sure the 50 you count are
  actually 50, not 50 mixed in with paper bets.
