// paper-trade/portfolio.mjs — a PAPER portfolio. No real money, no broker, ever.
//
// Models the parts that keep paper from lying to us:
//   - fees: a per-trade cost in basis points on traded notional. Without this,
//     a bot that trades constantly looks free; it isn't. Default 10 bps.
//   - long-only, 0..100% invested: a target fraction of current equity in the
//     asset. No shorting, no leverage — matches the strategy's shape.
//
// NOT modeled yet (honest gaps, flagged so we don't over-trust results):
//   - slippage / partial fills (we fill the whole target at the marked price)
//   - funding, spread, latency
// Paper results are an upper bound on live; treat them as such.
//
// Pure logic, no deps.

export function makePortfolio({ cash = 10000, feeBps = 10 } = {}) {
  let _cash = cash;
  let _units = 0;          // units of the asset held
  let _lastPrice = null;
  const fee = Math.max(0, feeBps) / 1e4;

  function equity(price) {
    const p = price == null ? _lastPrice : price;
    return p == null ? _cash : _cash + _units * p;
  }

  // Rebalance so the asset is `fraction` (0..1) of current equity at `price`.
  // Charges fee on the absolute traded notional. Returns the fee paid.
  function rebalance(price, fraction) {
    if (!(price > 0)) return 0;
    _lastPrice = price;
    const f = Math.max(0, Math.min(1, fraction));
    const eq = _cash + _units * price;
    const targetValue = f * eq;
    const targetUnits = targetValue / price;
    const deltaUnits = targetUnits - _units;
    const notional = Math.abs(deltaUnits) * price;
    const cost = notional * fee;
    _cash -= deltaUnits * price;   // buy (delta>0) spends cash; sell adds cash
    _cash -= cost;                 // fee always leaves cash
    _units = targetUnits;
    return cost;
  }

  return {
    rebalance,
    equity,
    mark: (price) => { if (price > 0) _lastPrice = price; return equity(price); },
    get cash() { return _cash; },
    get units() { return _units; },
  };
}
