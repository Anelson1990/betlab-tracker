// Tests for June's room route. Run: node agent-room/seats/june-route.test.mjs
import { buildJunePrompt, guardJuneTurn, makeJuneHandler, ROOM_PROTOCOL } from "./june-route.mjs";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name + "\n       got:  " + g + "\n       want: " + w); }
};
const ok = (name, cond) => eq(name, !!cond, true);

const ctx = {
  seat: "june",
  meeting: { title: "Wire ntfy", brief: "phone buzz on release", current_round: 2, budget_rounds: 10, wakes_used: 3, budget_wakes: 30 },
  thread: [{ seat_name: "claude", kind: "propose", tag: "continue", body: "trigger live, @June what next" }],
};

console.log("buildJunePrompt");
ok("carries the room protocol", buildJunePrompt(ctx).includes(ROOM_PROTOCOL.slice(0, 30)));
ok("includes the brief", buildJunePrompt(ctx).includes("phone buzz on release"));
ok("includes the budget line", buildJunePrompt(ctx).includes("round 2/10"));
ok("includes the transcript", buildJunePrompt(ctx).includes("trigger live"));
ok("empty thread is fine", buildJunePrompt({ meeting: {} }).includes("no turns yet"));

console.log("guardJuneTurn (safety floor)");
eq("decide -> downgraded to propose", guardJuneTurn({ body: "ship it", kind: "decide" }).kind, "propose");
eq("system -> downgraded to propose", guardJuneTurn({ body: "x", kind: "system" }).kind, "propose");
eq("junk tag dropped", guardJuneTurn({ body: "x", tag: "explode" }).tag, null);
eq("valid tag kept", guardJuneTurn({ body: "x", tag: "NEEDS_AUSTIN" }).tag, "needs_austin");
eq("blank body -> null", guardJuneTurn({ body: "   " }), null);
eq("plain string -> body", guardJuneTurn("just thinking out loud").body, "just thinking out loud");
eq("JSON string parsed", guardJuneTurn('{"body":"ok","tag":"pass"}').tag, "pass");
eq("@ stripped from atMention", guardJuneTurn({ body: "x", atMention: "@Claude" }).atMention, "claude");

(async () => {
  console.log("makeJuneHandler");
  const h = makeJuneHandler({ generate: async () => '{"body":"I\'ll frame it, @Claude you build","tag":"continue","atMention":"claude"}' });
  const t = await h(ctx);
  eq("handler -> guarded turn body", t.body, "I'll frame it, @Claude you build");
  eq("handler -> atMention", t.atMention, "claude");
  eq("refuses non-june seat", await h({ seat: "harper" }), null);
  eq("generate throws -> null (not ready)", await makeJuneHandler({ generate: async () => { throw new Error("down"); } })(ctx), null);
  eq("no generate -> null", await makeJuneHandler({})(ctx), null);
  // a model that tries to DECIDE is still downgraded through the handler
  eq("handler downgrades a decide attempt", (await makeJuneHandler({ generate: async () => '{"body":"we are shipping","kind":"decide"}' })(ctx)).kind, "propose");

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
