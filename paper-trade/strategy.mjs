// paper-trade/strategy.mjs — the ONE strategy all 10 bots share.
//
// A/B integrity: static bots and learner bots run the exact same strategy
// code. The only thing that differs is the PARAMETERS — static bots keep theirs
// fixed, learners tune theirs. So any outcome difference is about the tuning,
// not two different strategies.
//
// Strategy: long-only mean reversion with hysteresis.
//   z = (price - SMA(lookback)) / stddev(lookback)
//   flat -> go long (posFrac) when z <= -entryZ   (oversold)
//   long -> go flat        when z >=  exitZ        (reverted / overbought)
// Hysteresis (entryZ for entry, exitZ for exit) stops it flip-flopping on noise.
//
// Long-only on purpose: no shorting, no leverage — the simplest shape, and the
// one that can't blow past a 100%-invested position. Paper only, always.
//
// Pure functions, no deps.

export const DEFAULT_PARAMS = { lookback: 20, entryZ: 1.0, exitZ: 0.25, posFrac: 1.0 };

// Clamp params into a sane, long-only, no-leverage range. Learners search
// inside this box — they can't invent a 5x-leverage "strategy".
export function clampParams(p = {}) {
  const n = (v, d) => (Number.isFinite(+v) ? +v : d);
  const lookback = Math.max(2, Math.min(200, Math.round(n(p.lookback, DEFAULT_PARAMS.lookback))));
  const entryZ = Math.max(0.1, Math.min(4, n(p.entryZ, DEFAULT_PARAMS.entryZ)));
  const exitZ = Math.max(-2, Math.min(4, n(p.exitZ, DEFAULT_PARAMS.exitZ)));
  const posFrac = Math.max(0, Math.min(1, n(p.posFrac, DEFAULT_PARAMS.posFrac))); // 0..1 — no leverage
  return { lookback, entryZ, exitZ, posFrac };
}

function meanStd(arr) {
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const varc = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(varc) };
}

// Desired position fraction (0..posFrac) given prices so far and prior fraction.
// `prices` is the series up to and including the current bar.
export function signal(prices, params, prevFraction = 0) {
  const p = clampParams(params);
  if (!Array.isArray(prices) || prices.length < p.lookback + 1) return 0; // not enough data -> flat
  const window = prices.slice(-p.lookback);
  const { mean, std } = meanStd(window);
  const price = prices[prices.length - 1];
  if (std === 0) return prevFraction > 0 ? p.posFrac : 0; // flat line -> hold
  const z = (price - mean) / std;
  if (prevFraction > 0) {
    // currently long: exit to flat once it's reverted/overbought
    return z >= p.exitZ ? 0 : p.posFrac;
  }
  // currently flat: enter long when oversold
  return z <= -p.entryZ ? p.posFrac : 0;
}
