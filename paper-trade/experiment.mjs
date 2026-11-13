// paper-trade/experiment.mjs — the A/B: 5 static vs 5 learners, scored honestly.
//
// The honest protocol (Austin's call: risk-adjusted + a loss story):
//   1. Split the series into in-sample (first 60%) and out-of-sample (last 40%).
//   2. STATIC cohort: fixed params, run on the OUT-OF-SAMPLE window only.
//   3. LEARNER cohort: each tunes its params on the IN-SAMPLE window, then is
//      run on the SAME out-of-sample window with those tuned params.
//   4. Compare cohorts ONLY on out-of-sample, risk-adjusted (Sharpe + drawdown),
//      never on the data the learners tuned on.
//   5. Report each learner's overfit gap (in-sample return - out-of-sample
//      return). A big positive gap = it learned noise. The verdict says so out
//      loud, including "the learners lost" when that's what happened.
//
// Everything here is deterministic given the feed seed. No model, no network.

import { splitSeries } from "./feed.mjs";
import { runSeries, tuneParams, makeStaticCohort, makeLearnerSeeds } from "./bot.mjs";
import { score, overfitGap } from "./metrics.mjs";

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function cohortSummary(results, key) {
  const vals = results.map((r) => r.outSample.metrics[key]);
  return { mean: mean(vals), median: median(vals), best: Math.max(...vals), worst: Math.min(...vals) };
}

export function runExperiment({ series, inFrac = 0.6, cash = 10000, feeBps = 10, base } = {}) {
  if (!Array.isArray(series) || series.length < 20) throw new Error("series too short");
  const { inSample, outSample } = splitSeries(series, inFrac);

  // Static cohort — never tunes; scored out-of-sample.
  const statics = makeStaticCohort(5, base).map((b) => {
    const out = runSeries(outSample, b.params, { cash, feeBps });
    return { id: b.id, kind: b.kind, params: b.params, outSample: out };
  });

  // Learner cohort — tunes in-sample, scored out-of-sample, overfit gap recorded.
  const learners = makeLearnerSeeds(5, base).map((b) => {
    const tuned = tuneParams(inSample, b.seedParams, { cash, feeBps });
    const out = runSeries(outSample, tuned.params, { cash, feeBps });
    return {
      id: b.id, kind: b.kind,
      seedParams: b.seedParams, tunedParams: tuned.params,
      inSample: tuned.inSampleRun,
      outSample: out,
      overfitGap: overfitGap(tuned.inSampleRun.curve, out.curve),
    };
  });

  const staticOOS = cohortSummary(statics, "sharpe");
  const learnerOOS = cohortSummary(learners, "sharpe");
  const staticRet = cohortSummary(statics, "totalReturn");
  const learnerRet = cohortSummary(learners, "totalReturn");
  const avgOverfit = mean(learners.map((l) => l.overfitGap));

  // Buy-and-hold baseline on the out-of-sample window: did ANY bot beat just
  // holding the asset? Often the most honest humbling line in the whole report.
  const holdCurve = outSample.map((p) => (cash / outSample[0]) * p);
  const holdMetrics = score(holdCurve, outSample.map(() => 1));

  return {
    windows: { total: series.length, inSample: inSample.length, outSample: outSample.length, inFrac },
    statics, learners,
    summary: {
      staticSharpeOOS: staticOOS, learnerSharpeOOS: learnerOOS,
      staticReturnOOS: staticRet, learnerReturnOOS: learnerRet,
      avgOverfitGap: avgOverfit, buyHold: holdMetrics,
    },
    verdict: verdict({ staticOOS, learnerOOS, staticRet, learnerRet, avgOverfit, holdMetrics }),
  };
}

// The honest read. No spin: if the learners overfit or lost, it says so.
function verdict({ staticOOS, learnerOOS, staticRet, learnerRet, avgOverfit, holdMetrics }) {
  const lines = [];
  const better = learnerOOS.median > staticOOS.median ? "learners" : "static";
  lines.push(
    `Out-of-sample risk-adjusted (median Sharpe): learners ${learnerOOS.median.toFixed(3)} vs static ${staticOOS.median.toFixed(3)} -> ${better} ahead.`
  );
  lines.push(
    `Out-of-sample return (median): learners ${(learnerRet.median * 100).toFixed(2)}% vs static ${(staticRet.median * 100).toFixed(2)}%.`
  );
  if (avgOverfit > 0.02) {
    lines.push(
      `OVERFIT WARNING: learners averaged a +${(avgOverfit * 100).toFixed(2)}% in-sample-minus-out-of-sample return gap — they learned the practice window's noise, not a durable edge.`
    );
  } else {
    lines.push(`Overfit gap is small (avg ${(avgOverfit * 100).toFixed(2)}%) — tuning didn't obviously chase noise this run.`);
  }
  const bestBot = Math.max(learnerRet.best, staticRet.best);
  if (holdMetrics.totalReturn >= bestBot) {
    lines.push(
      `HUMBLING: buy-and-hold returned ${(holdMetrics.totalReturn * 100).toFixed(2)}% out-of-sample — no bot beat just holding. The "edge" didn't clear the simplest baseline.`
    );
  } else {
    lines.push(`Buy-and-hold out-of-sample: ${(holdMetrics.totalReturn * 100).toFixed(2)}% (at least one bot beat it).`);
  }
  lines.push("Reminder: single-run, simulated prices, no slippage. Not evidence of a live edge — a test of the harness and the A/B.");
  return lines;
}
