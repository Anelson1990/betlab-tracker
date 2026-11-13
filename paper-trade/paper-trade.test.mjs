// Tests for the paper-trade harness. Run: node paper-trade/paper-trade.test.mjs
import { stepReturns, totalReturn, maxDrawdown, volatility, sharpe, tradeCount, overfitGap, score } from "./metrics.mjs";
import { signal, clampParams, DEFAULT_PARAMS } from "./strategy.mjs";
import { makePortfolio } from "./portfolio.mjs";
import { simFeed, splitSeries, liveCryptoFeed } from "./feed.mjs";
import { runSeries, tuneParams, neighborGrid, makeStaticCohort, makeLearnerSeeds } from "./bot.mjs";
import { runExperiment } from "./experiment.mjs";

let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n + "\n       got:  " + a + "\n       want: " + b); } };
const ok = (n, c) => eq(n, !!c, true);
const close = (n, g, w, tol = 1e-9) => { if (Math.abs(g - w) <= tol) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n + "  got " + g + " want " + w); } };

console.log("metrics");
close("totalReturn 100->120 = 0.2", totalReturn([100, 110, 120]), 0.2);
eq("totalReturn of too-short -> 0", totalReturn([100]), 0);
close("maxDrawdown 100->80 off a 120 peak = ~0.333", maxDrawdown([100, 120, 80, 90]), (120 - 80) / 120, 1e-9);
eq("maxDrawdown monotonic up -> 0", maxDrawdown([1, 2, 3, 4]), 0);
eq("volatility of flat curve -> 0", volatility([100, 100, 100]), 0);
eq("sharpe with zero variance -> 0 (no Infinity)", sharpe([100, 100, 100]), 0);
eq("stepReturns length n-1", stepReturns([1, 2, 3]).length, 2);
eq("tradeCount counts flat->long entries", tradeCount([0, 0, 1, 1, 0, 1]), 2);
close("overfitGap = inRet - outRet", overfitGap([100, 150], [100, 110]), 0.5 - 0.1, 1e-9);
ok("score bundles the fields", "totalReturn" in score([100, 110], [0, 1]) && "maxDrawdown" in score([100, 110]));

console.log("strategy");
eq("clamp caps posFrac at 1 (no leverage)", clampParams({ posFrac: 5 }).posFrac, 1);
eq("clamp floors posFrac at 0 (no shorting)", clampParams({ posFrac: -3 }).posFrac, 0);
eq("clamp lookback min 2", clampParams({ lookback: 0 }).lookback, 2);
eq("clamp rejects NaN -> default lookback", clampParams({ lookback: "x" }).lookback, DEFAULT_PARAMS.lookback);
eq("not enough data -> flat (0)", signal([1, 2, 3], { lookback: 20 }, 0), 0);
{
  // Oversold entry: last price well below the window mean -> go long.
  const flatish = Array.from({ length: 20 }, () => 100);
  const prices = [...flatish, 90]; // a drop
  ok("oversold -> enters long", signal(prices, { lookback: 20, entryZ: 1, exitZ: 0.25, posFrac: 1 }, 0) > 0);
}
{
  // Already long, price reverts above exit threshold -> go flat.
  const flatish = Array.from({ length: 20 }, () => 100);
  const prices = [...flatish, 115];
  eq("reverted while long -> exits to flat", signal(prices, { lookback: 20, entryZ: 1, exitZ: 0.25, posFrac: 1 }, 1), 0);
}

console.log("portfolio");
{
  const pf = makePortfolio({ cash: 1000, feeBps: 0 });
  pf.rebalance(100, 1); // fully invested, no fee
  close("no-fee full invest keeps equity", pf.equity(100), 1000, 1e-6);
  close("units = cash/price", pf.units, 10, 1e-9);
}
{
  const pf = makePortfolio({ cash: 1000, feeBps: 100 }); // 1% fee
  const fee = pf.rebalance(100, 1);
  close("fee charged on traded notional (1% of 1000-ish)", fee > 0 && fee < 11, true, 0);
  ok("equity dropped by ~fee after a fee'd buy", pf.equity(100) < 1000 && pf.equity(100) > 985);
}
{
  const pf = makePortfolio({ cash: 1000, feeBps: 0 });
  pf.rebalance(100, 1);
  close("price doubles -> equity doubles (long)", pf.equity(200), 2000, 1e-6);
  pf.rebalance(200, 0);
  close("exit to flat locks in cash", pf.cash, 2000, 1e-6);
}

console.log("feed");
{
  const a = simFeed({ seed: 42, n: 100 });
  const b = simFeed({ seed: 42, n: 100 });
  eq("simFeed is deterministic per seed", JSON.stringify(a), JSON.stringify(b));
  const c = simFeed({ seed: 43, n: 100 });
  ok("different seed -> different series", JSON.stringify(a) !== JSON.stringify(c));
  eq("simFeed length", a.length, 100);
  ok("prices stay positive", a.every((p) => p > 0));
}
{
  const { inSample, outSample } = splitSeries(simFeed({ seed: 1, n: 100 }), 0.6);
  eq("split in-sample size", inSample.length, 60);
  eq("split out-of-sample size", outSample.length, 40);
}

(async () => {
  let threw = false;
  try { await liveCryptoFeed(); } catch { threw = true; }
  ok("liveCryptoFeed throws until a host is allow-listed (no silent sim-as-live)", threw);

  console.log("bot");
  {
    const series = simFeed({ seed: 7, n: 200 });
    const run = runSeries(series, DEFAULT_PARAMS);
    eq("runSeries curve length == series length", run.curve.length, series.length);
    ok("runSeries returns metrics", "sharpe" in run.metrics);
    eq("neighborGrid is bounded (5*5*3 = 75)", neighborGrid(DEFAULT_PARAMS).length, 75);
    const tuned = tuneParams(series.slice(0, 120), DEFAULT_PARAMS);
    ok("tuneParams returns clamped params", tuned.params.posFrac <= 1 && tuned.params.lookback >= 2);
    ok("tuneParams in-sample rank is finite", Number.isFinite(tuned.inSampleRank));
  }
  {
    eq("static cohort is 5", makeStaticCohort(5).length, 5);
    eq("learner cohort is 5", makeLearnerSeeds(5).length, 5);
    ok("static cohort params all no-leverage", makeStaticCohort(5).every((b) => b.params.posFrac <= 1));
  }

  console.log("experiment (A/B, deterministic)");
  {
    // A regime shift between in-sample and out-of-sample: the condition that
    // exposes overfitting. Learners tune on the calm first half, get tested on
    // a different second half.
    const series = simFeed({ seed: 11, n: 400, drift: 0.0005, vol: 0.02, regimeShiftAt: 240, regimeDrift: -0.0005 });
    const r = runExperiment({ series });
    eq("5 static bots", r.statics.length, 5);
    eq("5 learner bots", r.learners.length, 5);
    ok("windows split 60/40", r.windows.inSample > r.windows.outSample);
    ok("each learner has an overfit gap", r.learners.every((l) => typeof l.overfitGap === "number"));
    ok("verdict mentions out-of-sample", r.verdict.join(" ").toLowerCase().includes("out-of-sample"));
    ok("verdict is honest about simulation limits", r.verdict.join(" ").toLowerCase().includes("not evidence"));
    ok("summary carries a buy-hold baseline", "buyHold" in r.summary && "totalReturn" in r.summary.buyHold);
    // Determinism: same seed -> same verdict.
    const r2 = runExperiment({ series });
    eq("experiment deterministic for a fixed series", JSON.stringify(r.verdict), JSON.stringify(r2.verdict));
  }

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
