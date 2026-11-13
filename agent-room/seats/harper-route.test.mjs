// Tests for Harper's reviewer route. Run: node agent-room/seats/harper-route.test.mjs
import { HARPER_PROTOCOL, makeHarperHandler } from "./harper-route.mjs";

let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n + "\n       got:  " + a + "\n       want: " + b); } };
const ok = (n, c) => eq(n, !!c, true);

console.log("harper-route");
ok("protocol: reviewer + can't decide", HARPER_PROTOCOL.includes("REVIEW") && HARPER_PROTOCOL.includes("NEVER decide"));

(async () => {
  const h = makeHarperHandler({ generate: async () => '{"body":"checked it, clean to propose","kind":"review","tag":"continue","atMention":"claude"}' });
  const t = await h({ seat: "harper", meeting: { title: "x" }, thread: [] });
  eq("review turn body", t.body, "checked it, clean to propose");
  eq("kind review", t.kind, "review");
  eq("@mention parsed", t.atMention, "claude");
  eq("harper can't set review_ready (not the builder)", "reviewReady" in (await makeHarperHandler({ generate: async () => '{"body":"x","review_ready":true}' })({ seat: "harper" })), false);
  eq("refuses non-harper seat", await h({ seat: "june" }), null);

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
