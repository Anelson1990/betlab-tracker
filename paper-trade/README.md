# paper-trade — the 5-vs-5 A/B (paper only, no broker keys, ever)

Austin's experiment: **5 bots on a fixed strategy vs 5 bots that self-learn**, to
see whether self-learning actually helps — honestly, without fooling ourselves.

## Safety floor (non-negotiable)
- **Paper only.** No brokerage account, no API keys, no order endpoints. The
  harness marks a *paper* portfolio against observed prices; it never sends an
  order anywhere.
- **No live brokerage key goes near this until the code is vetted and it has
  paper-traded first** (Austin's rule, and mine).
- Live price data (crypto) is **prices only, read-only**, and needs one outbound
  host allow-listed in the environment network policy before it works — see
  `feed.mjs` (`liveCryptoFeed` throws until then, so sim data is never mistaken
  for live).

## The scope Austin chose
- **Market/data:** crypto, live public data (built + tested on an offline
  simulator first; flip to the live feed once the host is approved).
- **"Self-learning":** each learner **tunes its own strategy parameters** from its
  own results — a bounded local search, **no model call** (zero usage cost, fully
  auditable). Model-reflection can be added later if this proves out.
- **Scoring:** risk-adjusted (Sharpe + drawdown), **plus an explicit loss story** —
  the report says out loud when learners overfit or lose.

## How the honesty is built in
1. **Same strategy for everyone** (`strategy.mjs`) — only the params differ, so a
   difference in outcome is about tuning, not two different strategies.
2. **In-sample / out-of-sample split** (`feed.mjs` `splitSeries`, 60/40):
   learners tune on the first window, everyone is scored on the second. Learners
   never see the scoring window while tuning.
3. **Overfit gap** (`metrics.mjs` `overfitGap`): in-sample return minus
   out-of-sample return. A big positive gap = learned noise, not edge.
4. **Buy-and-hold baseline**: did any bot beat just holding the asset? Often the
   most humbling line in the report.
5. **Fees modeled** (`portfolio.mjs`, default 10 bps/trade). Slippage and partial
   fills are **not** modeled yet — so paper results are an *upper bound* on live.
   Flagged, not hidden.

## Run it
```
node paper-trade/run.mjs [seed] [n]      # one A/B on simulated data
node paper-trade/paper-trade.test.mjs    # the test suite
```

## What the first runs showed (simulated data)
The learners **overfit** — a +24% to +63% in-sample-vs-out-of-sample gap across
seeds — and on at least one seed the self-learners did **worse** out-of-sample
than the static bots. That is the expected, honest result of greedy parameter
tuning on noisy data, and it's exactly what this harness is built to surface.

**This is not evidence of a live trading edge.** It's a working, honest test rig:
single runs, simulated prices, no slippage. Real conclusions need many seeds /
long windows and live data — and even then, paper ≠ live.

## Files
- `strategy.mjs` — the shared long-only mean-reversion strategy (+ param clamps)
- `portfolio.mjs` — paper portfolio: cash/position/equity, per-trade fees
- `metrics.mjs` — return, drawdown, volatility, Sharpe, overfit gap
- `feed.mjs` — `simFeed` (offline, seeded) + `liveCryptoFeed` (stub, needs host)
- `bot.mjs` — run a series, tune params (learner), build the two cohorts
- `experiment.mjs` — the A/B protocol + the honest verdict
- `run.mjs` — CLI report
- `paper-trade.test.mjs` — 46 tests

_— Claude~_
