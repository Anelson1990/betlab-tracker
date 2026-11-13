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

export function extractMention(body, seatNames) {
  const m = String(body || "").match(/@([A-Za-z][\w-]*)/);
  if (!m) return null;
  const want = m[1].toLowerCase();
  return (seatNames || []).find((n) => n.toLowerCase() === want) || null;
}

export function normalizeTurn(raw, { seatNames = [] } = {}) {
  if (raw == null) return null; // seat still working / not ready
  const t = typeof raw === "string" ? { body: raw } : raw;
  if (!t.body || !String(t.body).trim()) return null;
  let kind = (t.kind || "propose").toLowerCase();
  if (kind === "decide") kind = "propose"; // bots can never DECIDE — downgrade, don't throw
  const atMention = t.atMention || extractMention(t.body, seatNames);
  return {
    body: String(t.body),
    kind,
    tag: t.tag ? String(t.tag).toLowerCase() : null,
    receipt: t.receipt || null,
    reviewReady: !!t.reviewReady,
    atMention: atMention || null,
  };
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

// Webhook adapter for an external bot route (June / Harper). Deploy-time: pass
// the route URL (keep it in env) + optionally a fetch impl. POSTs
// { seat, meeting, thread } and expects a TURN (or null) back. A route that is
// down / errors yields null -> the seat is "not ready" and the conductor waits
// or times the stick out; it never fabricates a turn.
export function webhookAdapter(url, fetchImpl) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  return async function (seat, ctx) {
    if (!url || !f) return null;
    const thread = ctx && ctx.readThread ? await ctx.readThread() : null;
    try {
      const res = await f(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seat, meeting: ctx && ctx.meeting, thread }),
      });
      if (!res || !res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
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
