// paper-trade/bot.mjs — a bot = shared strategy + its own params + a paper
// portfolio. Static bots keep params fixed; learner bots tune params on their
// own in-sample results (param search only — NO model call, so zero usage cost).

import { signal, clampParams, DEFAULT_PARAMS } from "./strategy.mjs";
import { makePortfolio } from "./portfolio.mjs";
import { score, sharpe } from "./metrics.mjs";

// Run the strategy with fixed params over a price series. Returns the equity
// curve, the fraction series (for trade counting), and the metric bundle.
export function runSeries(series, params, { cash = 10000, feeBps = 10 } = {}) {
  const p = clampParams(params);
  const pf = makePortfolio({ cash, feeBps });
  const curve = [];
  const fractions = [];
  let prevFraction = 0;
  for (let i = 0; i < series.length; i++) {
    const price = series[i];
    const prices = series.slice(0, i + 1);
    const frac = signal(prices, p, prevFraction);
    pf.rebalance(price, frac);
    curve.push(pf.equity(price));
    fractions.push(frac);
    prevFraction = frac;
  }
  return { params: p, curve, fractions, metrics: score(curve, fractions) };
}

// A small, bounded search grid around a seed param set. Learners hill-climb this
// — it's local, so they can't wander into absurd params, but it's wide enough to
// overfit the in-sample window if there's noise to chase (which is the point).
export function neighborGrid(seedParams = DEFAULT_PARAMS) {
  const s = clampParams(seedParams);
  const grid = [];
  const lookbacks = [s.lookback - 10, s.lookback - 5, s.lookback, s.lookback + 5, s.lookback + 10];
  const entries = [s.entryZ - 0.5, s.entryZ - 0.25, s.entryZ, s.entryZ + 0.25, s.entryZ + 0.5];
  const exits = [s.exitZ - 0.25, s.exitZ, s.exitZ + 0.25];
  for (const lookback of lookbacks)
    for (const entryZ of entries)
      for (const exitZ of exits)
        grid.push(clampParams({ ...s, lookback, entryZ, exitZ }));
  return grid;
}

// LEARNER: pick the params that score best ON THE IN-SAMPLE SERIES, by the
// ranking metric (default: in-sample Sharpe). Deliberately greedy on in-sample
// — so when we later score out-of-sample, overfitting shows as a drop.
export function tuneParams(inSample, seedParams = DEFAULT_PARAMS, opts = {}) {
  const { cash = 10000, feeBps = 10, rank = (m, curve) => sharpe(curve) } = opts;
  const grid = neighborGrid(seedParams);
  let best = null, bestParams = clampParams(seedParams), bestKey = -Infinity;
  for (const params of grid) {
    const run = runSeries(inSample, params, { cash, feeBps });
    const key = rank(run.metrics, run.curve);
    if (key > bestKey) { bestKey = key; best = run; bestParams = params; }
  }
  return { params: bestParams, inSampleRun: best, inSampleRank: bestKey };
}

// Build the two cohorts.
//   Static bots: fixed params, a spread of seeds so they're not identical.
//   Learner bots: each seeded at a slightly different starting point, then each
//                 tunes on the in-sample window. Variety keeps one lucky learner
//                 from standing in for the whole group.
export function makeStaticCohort(n = 5, base = DEFAULT_PARAMS) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `static-${i + 1}`, kind: "static", params: clampParams({ ...base, entryZ: base.entryZ + (i - 2) * 0.15 }) });
  }
  return out;
}

export function makeLearnerSeeds(n = 5, base = DEFAULT_PARAMS) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `learner-${i + 1}`, kind: "learner", seedParams: clampParams({ ...base, lookback: base.lookback + (i - 2) * 4 }) });
  }
  return out;
}
