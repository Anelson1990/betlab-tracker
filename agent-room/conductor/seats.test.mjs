// Tests for the getTurn layer. Run: node agent-room/conductor/seats.test.mjs
import { extractMention, normalizeTurn, makeDispatcher, fixtureAdapter } from "./seats.mjs";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name + "\n       got:  " + g + "\n       want: " + w); }
};
const names = ["austin", "claude", "june", "harper"];

console.log("extractMention");
eq("finds @June -> june", extractMention("hey @June take it", names), "june");
eq("unknown @mention -> null", extractMention("@nobody here", names), null);
eq("no mention -> null", extractMention("just text", names), null);

console.log("normalizeTurn");
eq("string -> propose turn", normalizeTurn("hello", { seatNames: names }).kind, "propose");
eq("null -> null (still working)", normalizeTurn(null), null);
eq("blank body -> null", normalizeTurn({ body: "   " }), null);
eq("decide downgraded to propose", normalizeTurn({ body: "x", kind: "decide" }).kind, "propose");
eq("system downgraded to propose", normalizeTurn({ body: "x", kind: "system" }).kind, "propose");
eq("unknown kind -> propose", normalizeTurn({ body: "x", kind: "admin" }).kind, "propose");
eq("uppercase bot kind normalized", normalizeTurn({ body: "x", kind: "Delegate" }).kind, "delegate");
eq("unicode-trick kind -> propose", normalizeTurn({ body: "x", kind: "revıew" }).kind, "propose");
eq("receipt/review-ready are dropped (untrusted here)", "receipt" in normalizeTurn({ body: "done", reviewReady: true, receipt: "job#9" }), false);
eq("parses @mention from body", normalizeTurn({ body: "ok @Harper review" }, { seatNames: names }).atMention, "harper");
eq("explicit atMention wins (@ stripped)", normalizeTurn({ body: "text", atMention: "@Claude" }, { seatNames: names }).atMention, "claude");
eq("tag normalized", normalizeTurn({ body: "y", tag: "NEEDS_AUSTIN" }).tag, "needs_austin");
eq("junk tag dropped", normalizeTurn({ body: "y", tag: "explode" }).tag, null);
eq("overlong body clamped to 8000", normalizeTurn({ body: "a".repeat(9000) }).body.length, 8000);

(async () => {
  console.log("dispatcher (fixture)");
  const fx = fixtureAdapter({ claude: [{ body: "built it @Harper", tag: "continue" }], june: [null] });
  const d = makeDispatcher({ claude: fx, june: fx }, { seatNames: names });
  const t1 = await d("claude", {});
  eq("dispatch claude -> normalized turn body", t1.body, "built it @Harper");
  eq("dispatch claude -> @mention parsed", t1.atMention, "harper");
  eq("exhausted fixture -> null", await d("claude", {}), null);
  eq("no adapter for seat -> null", await d("zzz", {}), null);

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
