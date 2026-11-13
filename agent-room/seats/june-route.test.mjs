// Tests for June's route (thin, on the shared factory). Run: node agent-room/seats/june-route.test.mjs
import { JUNE_PROTOCOL, makeJuneHandler } from "./june-route.mjs";

let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n + "\n       got:  " + a + "\n       want: " + b); } };
const ok = (n, c) => eq(n, !!c, true);

console.log("june-route");
ok("protocol: propose + can't decide + no consequential", JUNE_PROTOCOL.includes("PROPOSE") && JUNE_PROTOCOL.includes("NEVER decide") && JUNE_PROTOCOL.includes("Face ID"));

(async () => {
  const h = makeJuneHandler({ generate: async () => '{"body":"I will frame it, @Claude you build","tag":"continue","atMention":"claude"}' });
  const t = await h({ seat: "june", meeting: { title: "x" }, thread: [] });
  eq("turn body", t.body, "I will frame it, @Claude you build");
  eq("@mention parsed", t.atMention, "claude");
  eq("decide downgraded via factory guard", (await makeJuneHandler({ generate: async () => '{"body":"ship","kind":"decide"}' })({ seat: "june" })).kind, "propose");
  eq("june can't set review_ready", "reviewReady" in (await makeJuneHandler({ generate: async () => '{"body":"x","review_ready":true}' })({ seat: "june" })), false);
  eq("refuses non-june seat", await h({ seat: "harper" }), null);

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
