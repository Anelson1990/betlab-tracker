// paper-trade/run.mjs — run the A/B once and print an honest report.
//   node paper-trade/run.mjs [seed] [n]
// Uses simFeed (offline, deterministic). Swap to liveCryptoFeed once a public
// crypto price host is allow-listed — see feed.mjs.

import { simFeed } from "./feed.mjs";
import { runExperiment } from "./experiment.mjs";

const seed = Number(process.argv[2] || 11);
const n = Number(process.argv[3] || 400);

const series = simFeed({ seed, n, drift: 0.0004, vol: 0.02, regimeShiftAt: Math.floor(n * 0.6), regimeDrift: -0.0004 });
const r = runExperiment({ series });

const pct = (x) => (x * 100).toFixed(2) + "%";
console.log(`\n=== Paper-trade A/B (SIMULATED data, seed ${seed}, ${n} bars) ===`);
console.log(`Windows: ${r.windows.inSample} in-sample / ${r.windows.outSample} out-of-sample (learners tune in-sample, scored out-of-sample)\n`);

console.log("STATIC cohort (fixed params) — out-of-sample:");
for (const b of r.statics) console.log(`  ${b.id}: return ${pct(b.outSample.metrics.totalReturn)}, maxDD ${pct(b.outSample.metrics.maxDrawdown)}, Sharpe ${b.outSample.metrics.sharpe.toFixed(3)}, trades ${b.outSample.metrics.trades}`);

console.log("\nLEARNER cohort (tuned on in-sample) — out-of-sample:");
for (const b of r.learners) console.log(`  ${b.id}: return ${pct(b.outSample.metrics.totalReturn)}, maxDD ${pct(b.outSample.metrics.maxDrawdown)}, Sharpe ${b.outSample.metrics.sharpe.toFixed(3)}, overfit gap ${pct(b.overfitGap)}`);

console.log("\n--- Honest verdict ---");
for (const line of r.verdict) console.log("  * " + line);
console.log("");
