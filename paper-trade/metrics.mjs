// paper-trade/metrics.mjs — risk-adjusted scoring for an equity curve.
//
// Honest-measurement note: raw total return is the easiest number to fool
// yourself with. A bot can post a great return by taking wild risk and getting
// lucky once. So the score carries drawdown + volatility alongside return, and
// the experiment compares groups on these — not on P&L alone.
//
// Pure functions, no deps. `node --check` clean.

// Per-step simple returns from an equity curve [e0, e1, ...] -> [(e1/e0-1), ...].
export function stepReturns(curve) {
  if (!Array.isArray(curve) || curve.length < 2) return [];
  const out = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1];
    out.push(prev === 0 ? 0 : curve[i] / prev - 1);
  }
  return out;
}

// Total return over the whole curve, as a fraction (0.12 = +12%).
export function totalReturn(curve) {
  if (!Array.isArray(curve) || curve.length < 2 || curve[0] === 0) return 0;
  return curve[curve.length - 1] / curve[0] - 1;
}

// Max peak-to-trough drawdown, as a POSITIVE fraction (0.20 = a 20% drop from a
// prior high). Lower is better.
export function maxDrawdown(curve) {
  if (!Array.isArray(curve) || curve.length === 0) return 0;
  let peak = curve[0], worst = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > worst) worst = dd;
    }
  }
  return worst;
}

// Standard deviation of per-step returns (population). Our proxy for volatility.
export function volatility(curve) {
  const r = stepReturns(curve);
  if (r.length === 0) return 0;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const varc = r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length;
  return Math.sqrt(varc);
}

// Per-step Sharpe-like ratio: mean step return / stddev of step returns.
// NOT annualized — it's a within-sample risk-adjusted number for ranking only.
// Returns 0 when there's no variance (avoids div-by-zero / Infinity).
export function sharpe(curve, rf = 0) {
  const r = stepReturns(curve);
  if (r.length === 0) return 0;
  const mean = r.reduce((a, b) => a + b, 0) / r.length - rf;
  const sd = volatility(curve);
  return sd === 0 ? 0 : mean / sd;
}

// Number of round-trip trades implied by a fraction series (0->+ is an entry).
export function tradeCount(fractions) {
  if (!Array.isArray(fractions)) return 0;
  let n = 0, prev = 0;
  for (const f of fractions) {
    if (prev <= 0 && f > 0) n++;      // an entry
    prev = f;
  }
  return n;
}

// One bundle of metrics for a run.
export function score(curve, fractions = []) {
  return {
    totalReturn: totalReturn(curve),
    maxDrawdown: maxDrawdown(curve),
    volatility: volatility(curve),
    sharpe: sharpe(curve),
    trades: tradeCount(fractions),
    finalEquity: Array.isArray(curve) && curve.length ? curve[curve.length - 1] : 0,
  };
}

// The overfitting tell: how much better a bot looked on the data it TUNED on
// vs. the data it was then tested on. A large positive gap = it learned the
// in-sample noise, not a real edge. This is the "loss story" made measurable.
export function overfitGap(inSampleCurve, outSampleCurve) {
  return totalReturn(inSampleCurve) - totalReturn(outSampleCurve);
}
