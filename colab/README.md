# NHL model (Colab)

`nhl_model_v12.py` — paste the whole file into one Colab cell and run it.

## Settings (top of file)
- `GAME_DATE` — `None` = today (Central time), or `'2026-10-07'`.
- `ODDS_KEY` — optional The Odds API key. Needed for **real** player SOG lines (1 request per game) and as a backup ML source.
- `PROP_LINES` — manual SOG lines if you have no key: `{'Auston Matthews': (3.5, -120, -110)}`.
- Thresholds: `ML_TRACK_MIN_EDGE`, `SOG_MIN_EDGE`, `SOG_MIN_EDGE_EST`, `SOG_MAX_PICKS`.

## Shots-on-goal formula
```
expected SOG = shots/60 (shrunk) × projected TOI / 60 × opponent shots-allowed factor
```
- **shots/60**: this season's rate, shrunk toward last season's rate (which is itself shrunk toward the F/D league average). `K_MIN` = 200 minutes of prior.
- **projected TOI**: 60% last-5-games average + 40% season average.
- **opponent factor**: opponent shots-against per game (shrunk toward last season) ÷ league average.
- **P(over/under)**: negative binomial, dispersion estimated from the players' game logs (Poisson if none detected).
- **Estimated lines** (no real line): the line is set near the player's season average and priced from that plain average plus vig, so an "edge" only appears where the model disagrees with the raw average. These results are tracked separately from real-line picks.

## Tracking
Every run writes to `MyDrive/nhl_model/nhl_ledger.csv` and grades earlier picks from NHL boxscores:
- **ML**: every game's model side is logged. Edge ≥ `ML_TRACK_MIN_EDGE` counts as a bet (W-L, units at the listed odds, ROI, by tier). Model accuracy and Brier score cover every game.
- **SOG**: picks are tagged `PICK`, and all other projected players `TRACK`. Record is split by real vs estimated lines and by over/under. The projection bias/MAE line shows whether the formula runs high or low.
- A player who doesn't dress is graded `V` (void), and a line hit exactly is `P` (push).
- Rerunning the same day refreshes pending picks for games that haven't started. Games already in progress are never overwritten, so run it close to when you bet.
- If there's a strong/value ML bet, the script prints one line of JSON you can paste into BetLab's POTD "Paste JSON" box.
