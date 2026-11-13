// Agent Room — the Claude (builder) seat's complete(), deploy-time.
//
// This is the wiring Harper's #5/the deploy asked for: turn the fenced builder
// prompt into a real model call and parse the reply into a raw TURN (which
// normalizeTurn then shapes + guards, and validateTurn gates).
//
// Design choices that matter:
//   - The Anthropic client is INJECTED (not imported here), so this module has
//     no SDK dependency and the tests run with zero install. main.mjs builds the
//     real client and passes it in.
//   - The model id comes from the deploy (process.env.ROOM_CLAUDE_MODEL), never
//     hardcoded. Security-critical reasoning stays on the strong model — the
//     deploy sets a strong model id (see the claude-api skill for current ids).
//   - Any failure (no client/model, network, auth, unparseable reply) returns
//     null = the seat is "not ready". It NEVER fabricates a turn.

import { buildSeatPrompt } from "../seats/seat-route.mjs";
import { CLAUDE_BUILDER_PROTOCOL } from "./seats.mjs";

// Parse the model's reply text into a raw TURN object. The builder is told to
// reply as compact JSON; be tolerant — try whole-string JSON, then the first
// {...} block, then fall back to treating the text as a plain propose body.
export function parseModelTurn(text) {
  const s = (text == null ? "" : String(text)).trim();
  if (!s) return null;
  const tryParse = (str) => { try { return JSON.parse(str); } catch { return null; } };
  let obj = tryParse(s);
  if (!obj) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) obj = tryParse(m[0]);
  }
  if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
  return { body: s }; // couldn't parse JSON -> treat the whole reply as the body
}

// Pull the text out of an Anthropic Messages response (ignore thinking blocks).
export function textFromResponse(res) {
  const content = res && Array.isArray(res.content) ? res.content : [];
  return content.filter((b) => b && b.type === "text").map((b) => b.text).join("\n");
}

// Build a complete(ctx) for claudeAdapter. `client` is an Anthropic client
// (injected), `model` the strong model id from env, `effort` the thinking effort
// (default high — this seat does the security-critical build/review reasoning).
export function makeClaudeComplete({ client, model, maxTokens = 2048, effort = "high" } = {}) {
  return async function claudeComplete(ctx) {
    if (!client || !model) return null; // not wired -> seat "not ready"
    const thread = ctx && ctx.readThread ? await ctx.readThread() : [];
    const prompt = buildSeatPrompt(CLAUDE_BUILDER_PROTOCOL, { meeting: ctx && ctx.meeting, thread });
    try {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        output_config: { effort },
        messages: [{ role: "user", content: prompt }],
      });
      return parseModelTurn(textFromResponse(res));
    } catch (e) {
      return null; // network / auth / bad reply -> not ready; never fabricate
    }
  };
}
