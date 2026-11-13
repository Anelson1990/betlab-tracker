// Agent Room — the getTurn layer (P1, DRAFT for review).
//
// How each seat produces a turn for the conductor's tick(). A seat returns a
// TURN object (or null = still working / not ready):
//   { body (required), kind?, tag?, receipt?, reviewReady?, atMention? }
//     kind: "propose" | "review" | ...   (never "decide" — bots can't DECIDE)
//     tag:  "continue" | "pass" | "working" | "needs_austin" | "done"
//     atMention: a seat to hand the stick to (else parsed from "@Name" in body)
//
// The dispatcher routes getTurn(seat, ctx) to that seat's adapter. Adapters:
//   - fixtureAdapter  : scripted turns, for tests / dry-runs (no I/O)
//   - webhookAdapter   : June / Harper's external bot routes (deploy-time URL)
//   - claudeAdapter    : the Claude seat — strong model, via an injected
//                        `complete()` so the deploy wires the real Anthropic call
//                        (keeps security-critical reasoning on the strong model).

import { botKind, validTag, clampBody } from "../contract.mjs";

export function extractMention(body, seatNames) {
  const m = String(body || "").match(/@([A-Za-z][\w-]*)/);
  if (!m) return null;
  const want = m[1].toLowerCase();
  return (seatNames || []).find((n) => n.toLowerCase() === want) || null;
}

export function normalizeTurn(raw, { seatNames = [] } = {}) {
  if (raw == null) return null; // seat still working / not ready
  const t = typeof raw === "string" ? { body: raw } : raw;
  const body = clampBody(t && t.body); // trim + clamp to the DB's 8000-char max
  if (!body) return null;
  const explicit = t.atMention ? String(t.atMention).toLowerCase().replace(/^@/, "") : null;
  const atMention = explicit || extractMention(body, seatNames);
  // kind -> a valid bot kind (decide / system / unknown / unicode trick -> propose).
  // receipt and review_ready are NOT trusted from this generic path — a bot must
  // not be able to self-assert "ready for review" and burn a reviewer's wake. The
  // builder seat sets those through its own authorized guard when it's built.
  return { body, kind: botKind(t.kind), tag: validTag(t.tag), atMention: atMention || null };
}

// Dispatcher: getTurn(seat, ctx) -> normalized TURN (or null). `registry` maps a
// seat name to an adapter; "*" is a fallback. A missing adapter yields null, so
// the conductor treats the seat as "not ready" (its stick times out cleanly).
export function makeDispatcher(registry, { seatNames = [] } = {}) {
  return async function getTurn(seat, ctx) {
    const adapter = (registry && (registry[seat] || registry["*"])) || null;
    if (!adapter) return null;
    const names = seatNames.length ? seatNames : (ctx && ctx.seats ? ctx.seats.map((s) => s.name) : []);
    const raw = await adapter(seat, ctx);
    return normalizeTurn(raw, { seatNames: names });
  };
}

// --- adapters ---

// Scripted adapter for tests / dry-runs: { seat: [turn, turn, ...] }, consumed in order.
export function fixtureAdapter(script) {
  const q = {};
  for (const k of Object.keys(script || {})) q[k] = (script[k] || []).slice();
  return async function (seat) {
    const arr = q[seat];
    return arr && arr.length ? arr.shift() : null;
  };
}

// Webhook adapter for an external bot route (June / Harper). Deploy-time options:
//   { token, timeoutMs = 18000, fetchImpl }
// POSTs { seat, meeting, thread } with a shared-secret `x-room-token` header and
// aborts after timeoutMs so a slow/hung route never blows the 90s stick. A route
// that is down / slow / errors yields null -> the seat is "not ready" and the
// conductor waits or times the stick out; it never fabricates a turn. Keep both
// the route URL and the token in env, off the repo.
export function webhookAdapter(url, opts = {}) {
  const { token, timeoutMs = 18000, fetchImpl } = opts;
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  return async function (seat, ctx) {
    if (!url || !f) return null;
    const thread = ctx && ctx.readThread ? await ctx.readThread() : null;
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const headers = { "content-type": "application/json" };
      if (token) headers["x-room-token"] = token;
      const res = await f(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ seat, meeting: ctx && ctx.meeting, thread }),
        signal: ctl ? ctl.signal : undefined,
      });
      if (!res || !res.ok) return null;
      return await res.json();
    } catch (e) {
      return null; // timeout / abort / network / bad json -> not ready
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

// Claude-seat adapter: the strong model produces the turn. `complete(ctx)` is
// injected so the deploy wires the real Anthropic call (see the claude-api skill
// for current model IDs). Returns a string or a TURN object; normalizeTurn
// handles the shape. Security-critical reasoning stays on the strong model —
// never delegate the Claude seat's turn to a cheap worker.
export function claudeAdapter(complete, opts = {}) {
  return async function (seat, ctx) {
    if (typeof complete !== "function") return null;
    return complete({ seat, meeting: ctx && ctx.meeting, readThread: ctx && ctx.readThread, ...opts });
  };
}
