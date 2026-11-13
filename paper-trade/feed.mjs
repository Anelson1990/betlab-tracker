// paper-trade/feed.mjs — price sources for the paper-trade harness.
//
// Two kinds:
//   simFeed(...)      — a seeded synthetic series. Fully offline + deterministic,
//                       so tests and the harness run with zero network and give
//                       the same numbers every time. Good for building/testing
//                       the machinery. NOT a claim about real markets.
//   liveCryptoFeed()  — real public crypto prices. Needs ONE outbound host
//                       allow-listed in the environment's network policy, so it
//                       is a documented stub until Austin approves that host.
//
// Austin's call: live crypto data. We build + test on simFeed, then flip to the
// live feed once the host is allowed — the rest of the harness doesn't change.

// mulberry32: tiny seeded PRNG so a given seed -> the same series every run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal via Box–Muller, driven by a mulberry32 stream.
function makeGauss(rand) {
  return () => {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

// Geometric-ish random walk with optional regime shift partway through, so the
// in-sample and out-of-sample windows can differ — which is exactly the
// condition under which an overfit learner gets exposed.
export function simFeed({ seed = 1, n = 500, start = 100, drift = 0.0002, vol = 0.02, regimeShiftAt = null, regimeDrift = null } = {}) {
  const rand = mulberry32(seed);
  const gauss = makeGauss(rand);
  const out = [start];
  for (let i = 1; i < n; i++) {
    const d = regimeShiftAt != null && i >= regimeShiftAt && regimeDrift != null ? regimeDrift : drift;
    const prev = out[i - 1];
    const next = prev * Math.exp(d - 0.5 * vol * vol + vol * gauss());
    out.push(Math.max(0.01, next));
  }
  return out;
}

// Split a series into [inSample, outSample]. Learners tune on the first part and
// are scored on the second — they never see the out-of-sample window while tuning.
export function splitSeries(series, inFrac = 0.6) {
  const cut = Math.max(2, Math.floor(series.length * inFrac));
  return { inSample: series.slice(0, cut), outSample: series.slice(cut) };
}

// LIVE feed — intentionally a stub. Wiring it needs:
//   1. Austin to approve one outbound host (a public crypto price API) in the
//      environment network policy. No API key, no account, read-only.
//   2. No brokerage, no order endpoints — PRICES ONLY. This harness never sends
//      an order anywhere; it marks a paper portfolio against observed prices.
// Until (1), this throws so nobody mistakes sim data for live data.
export async function liveCryptoFeed(/* { symbol, bars, fetchImpl } = {} */) {
  throw new Error(
    "liveCryptoFeed not wired: needs one public crypto price host allow-listed " +
    "in the environment network policy (prices only, read-only, no keys). " +
    "Until then, use simFeed for offline/deterministic runs."
  );
}
