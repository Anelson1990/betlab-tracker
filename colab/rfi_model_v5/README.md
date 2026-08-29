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
