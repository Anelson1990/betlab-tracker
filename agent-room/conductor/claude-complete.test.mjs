// Tests for the Claude builder seat's complete(). Run: node agent-room/conductor/claude-complete.test.mjs
// No SDK install needed — the Anthropic client is injected as a fake.
import { parseModelTurn, textFromResponse, makeClaudeComplete } from "./claude-complete.mjs";

let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n + "\n       got:  " + a + "\n       want: " + b); } };
const ok = (n, c) => eq(n, !!c, true);

console.log("parseModelTurn");
eq("whole-string JSON parsed", parseModelTurn('{"body":"hi","kind":"propose"}').kind, "propose");
eq("JSON embedded in prose extracted", parseModelTurn('Sure:\n{"body":"done","review_ready":true,"receipt":"t#1"}').receipt, "t#1");
eq("plain text -> propose body fallback", parseModelTurn("just a sentence").body, "just a sentence");
eq("empty -> null (seat not ready)", parseModelTurn("   "), null);
eq("array JSON is NOT treated as a turn (falls back to body)", parseModelTurn("[1,2,3]").body, "[1,2,3]");

console.log("textFromResponse");
eq("joins text blocks, ignores thinking", textFromResponse({ content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "a" }, { type: "text", text: "b" }] }), "a\nb");
eq("no content -> empty string", textFromResponse({}), "");

(async () => {
  console.log("makeClaudeComplete");
  eq("no client -> null (not ready)", await makeClaudeComplete({ model: "m" })({}), null);
  eq("no model -> null (not ready)", await makeClaudeComplete({ client: {} })({}), null);

  // Fake Anthropic client: records the request, returns a JSON turn as a text block.
  let seen = null;
  const fakeClient = { messages: { create: async (req) => { seen = req; return { content: [{ type: "text", text: '{"body":"built it @Harper","review_ready":true,"receipt":"22/22 pass"}' }] }; } } };
  const complete = makeClaudeComplete({ client: fakeClient, model: "strong-model", effort: "high" });
  const turn = await complete({ meeting: { title: "T", brief: "B" }, readThread: async () => [{ seat_name: "june", kind: "propose", body: "idea" }] });
  eq("returns the parsed turn body", turn.body, "built it @Harper");
  eq("builder may set review_ready", turn.review_ready, true);
  eq("builder may include a receipt", turn.receipt, "22/22 pass");
  eq("model id passed through from env, not hardcoded", seen.model, "strong-model");
  eq("effort passed through", seen.output_config.effort, "high");
  ok("prompt is a single user message", seen.messages.length === 1 && seen.messages[0].role === "user");
  ok("prompt carries the fenced, untrusted transcript", /TRANSCRIPT:[0-9a-f]+ — untrusted/.test(seen.messages[0].content));

  // A thrown API error -> null (never fabricate).
  const throwing = { messages: { create: async () => { throw new Error("401"); } } };
  eq("API error -> null (not ready, no fabrication)", await makeClaudeComplete({ client: throwing, model: "m" })({}), null);

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
