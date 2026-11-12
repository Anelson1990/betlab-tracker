// Agent Room — conductor core logic (P1 skeleton, DRAFT for Harper's review).
//
// Pure functions only: no DB, no network, no side effects. This is the "brain"
// of the talking-stick conductor, written so every rule is unit-testable on its
// own. The runtime (what reads/writes the Supabase board and drives the loop)
// wraps these; it is intentionally NOT here yet.
//
// State shapes mirror the P1 board schema (room.meeting / room.seat / room.turn):
//
//   meeting = {
//     budget: { rounds, minutes, wakes, stickTimeoutSec },
//     used:   { rounds, minutes, wakes },
//     currentRound, currentSeat
//   }
//   seat = { name, role, activation:'active'|'on_demand', isChair,
//            wakeCap, wakesUsed, state:'active'|'dormant'|'working'|'stalled'|'done' }
//   turn = { seatName, kind, tag, body, receipt, reviewReady, atMention }

// ---------------------------------------------------------------------------
// Turn routing: whose stick is next.
// Default = round-robin over ACTIVE non-chair seats. An @-mention skips straight
// to that seat (resume the lap from there). A ping-pong between the same two
// seats that hits 3 hops in a row hands control back to the chair.
// ---------------------------------------------------------------------------
export function nextSpeaker(meeting, seats, opts = {}) {
  const { atMention = null, pingPong = { count: 0 } } = opts;
  const chair = seats.find((s) => s.isChair);
  const chairName = chair ? chair.name : null;

  if (atMention) {
    const target = seats.find((s) => s.name === atMention);
    if (target) {
      if (pingPong.count >= 3) {
        return { seat: chairName, reason: "ping-pong cap (3) — back to chair", roundAdvance: false };
      }
      return {
        seat: target.name,
        reason: "@-mention skip",
        roundAdvance: false,
        wakeNeeded: target.state !== "active", // dormant/on-demand target must be woken
      };
    }
  }

  const rotation = seats.filter((s) => s.state === "active" && !s.isChair);
  if (rotation.length === 0) {
    return { seat: chairName, reason: "no active seats — back to chair", roundAdvance: false };
  }
  const order = rotation.map((s) => s.name);
  const idx = order.indexOf(meeting.currentSeat);
  const nextIdx = (idx + 1) % order.length;
  const roundAdvance = idx >= 0 && nextIdx === 0; // wrapped the table = new lap
  return { seat: order[nextIdx], reason: "round-robin", roundAdvance };
}

// ---------------------------------------------------------------------------
// Budgets: warn at 80% of any ceiling, stop at 100%, whichever trips first.
// ---------------------------------------------------------------------------
export function budgetStatus(meeting) {
  const b = meeting.budget, u = meeting.used;
  const dims = [
    ["rounds", u.rounds, b.rounds],
    ["minutes", u.minutes, b.minutes],
    ["wakes", u.wakes, b.wakes],
  ];
  const trips = [];
  let level = "ok";
  for (const [name, used, cap] of dims) {
    if (!cap || cap <= 0) continue;
    const pct = used / cap;
    if (pct >= 1) { trips.push({ name, pct, level: "stop" }); level = "stop"; }
    else if (pct >= 0.8) { trips.push({ name, pct, level: "warn" }); if (level === "ok") level = "warn"; }
  }
  return { level, trips };
}

// ---------------------------------------------------------------------------
// Wake policy. Active seats are always wakeable. An on-demand seat (Harper) is
// metered against its wake cap. If the cap is spent but a review is still
// needed, we DO NOT skip the review — we pause for Austin (fail-safe, not
// fail-open).
// ---------------------------------------------------------------------------
export function wakeDecision(seat, opts = {}) {
  const { reviewNeeded = false } = opts;
  if (seat.activation !== "on_demand") return { wake: true, reason: "active seat" };
  const cap = seat.wakeCap == null ? Infinity : seat.wakeCap;
  if (seat.wakesUsed < cap) return { wake: true, reason: "under wake cap" };
  if (reviewNeeded) {
    return { wake: false, pauseForAustin: true, reason: "wake cap reached — pause for Austin rather than skip the review" };
  }
  return { wake: false, pauseForAustin: false, reason: "wake cap reached — no review pending" };
}

// ---------------------------------------------------------------------------
// End-tag effects. A missing/invalid tag is nudged once, then treated as a
// pass — never a hard stop, and never DONE or NEEDS AUSTIN by default.
// ---------------------------------------------------------------------------
export function tagEffect(tag) {
  switch (String(tag || "").toLowerCase()) {
    case "continue": return { action: "advance" };
    case "pass": return { action: "advance", note: "seat yielded" };
    case "working": return { action: "advance", markWorking: true, checkbacksMin: [2, 10, 30] };
    case "needs_austin": return { action: "stop", alertAustin: true };
    case "done": return { action: "propose_end", validateBrief: true, note: "DONE is a proposal; chair confirms against the brief" };
    default: return { action: "nudge_then_pass", note: "missing/invalid tag: nudge once, then treat as PASS" };
  }
}

// ---------------------------------------------------------------------------
// Turn validation (defense-in-depth; the board also enforces the DECIDE rule).
// - only the chair may post a DECIDE turn
// - a review-ready flag must carry a receipt (claim vs receipt)
// ---------------------------------------------------------------------------
export function validateTurn(turn, seats) {
  const seat = seats.find((s) => s.name === turn.seatName);
  if (!seat) return { ok: false, error: "unknown seat" };
  if (turn.kind === "decide" && !seat.isChair) return { ok: false, error: "only the chair may DECIDE" };
  if (turn.reviewReady && !turn.receipt) return { ok: false, error: "review-ready requires a receipt / self-verify" };
  return { ok: true };
}
