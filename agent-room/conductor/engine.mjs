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
  // Harper resolution #3: a wake_cap applies to ANY seat that has one, not just
  // on-demand seats. A seat with no cap (null) is always wakeable.
  const cap = seat.wakeCap == null ? Infinity : seat.wakeCap;
  if ((seat.wakesUsed || 0) < cap) {
    return { wake: true, reason: cap === Infinity ? "no wake cap" : "under wake cap" };
  }
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
  // kind=system is the conductor's voice only — it comes from the special
  // 'system' poster, never a seat-bot (which could otherwise forge round
  // markers or "stick passed to you" and hijack turn order).
  if (turn.kind === "system" && turn.seatName !== "system") {
    return { ok: false, error: "kind=system is conductor-only (the 'system' poster)" };
  }
  if (turn.seatName === "system") {
    if (turn.kind === "decide") return { ok: false, error: "the 'system' poster cannot DECIDE" };
    return { ok: true, system: true }; // conductor-only; credential enforced server-side
  }
  const seat = seats.find((s) => s.name === turn.seatName);
  if (!seat) return { ok: false, error: "unknown seat" };
  if (turn.kind === "decide" && !seat.isChair) return { ok: false, error: "only the chair may DECIDE" };
  if (turn.reviewReady && !turn.receipt) return { ok: false, error: "review-ready requires a receipt / self-verify" };
  return { ok: true };
}

// ===========================================================================
// P1c — runtime enforcement the conductor drives (backs room_advance /
// room_wake_seat). Still pure logic; the SQL functions enforce the same rules
// server-side. DRAFT for Harper's review.
// ===========================================================================

// Locked safety ceiling. Per-meeting budgets may be LOWER, never higher.
export const HARD_CAP = { rounds: 10, minutes: 30, wakes: 30, stickTimeoutSec: 90 };

// A meeting's budget must be positive and within the hard cap on every axis.
export function validateBudget(budget) {
  const errors = [];
  for (const k of ["rounds", "minutes", "wakes", "stickTimeoutSec"]) {
    const v = budget ? budget[k] : undefined;
    if (v == null || !(v > 0)) errors.push(`${k} must be > 0`);
    else if (v > HARD_CAP[k]) errors.push(`${k} ${v} exceeds hard cap ${HARD_CAP[k]}`);
  }
  return { ok: errors.length === 0, errors };
}

// Stick timeout: has the current holder gone silent past the stick window?
// The chair (Austin) is NEVER timed out — he takes as long as he wants.
export function stickExpired(meeting, currentSeat, turnStartedAtMs, nowMs) {
  if (currentSeat && currentSeat.isChair) {
    return { expired: false, reason: "chair holds the stick — never timed out" };
  }
  const windowMs = (meeting.budget.stickTimeoutSec || HARD_CAP.stickTimeoutSec) * 1000;
  const elapsedMs = nowMs - turnStartedAtMs;
  const expired = elapsedMs >= windowMs;
  return { expired, elapsedSec: Math.round(elapsedMs / 1000), reason: expired ? "stick timeout — reclaim + advance" : "within stick window" };
}

// Meeting time budget as a post gate (mirrors the board trigger, defence in
// depth). The chair is exempt — can post/close/decide past the time cap.
export function timeBudgetBlocks(meeting, startedAtMs, nowMs, posterIsChair) {
  if (posterIsChair) return false;
  return (nowMs - startedAtMs) > meeting.budget.minutes * 60000;
}

// Wake metering (backs room_wake_seat): a wake must pass BOTH the seat's wake
// cap AND the meeting's wake budget. Over either, if a review is pending we
// pause for Austin rather than skip it (fail-safe, not fail-open).
export function wakeMeter(seat, meeting, opts = {}) {
  const { reviewNeeded = false } = opts;
  const base = wakeDecision(seat, opts);
  if (!base.wake) return { ...base, incrementSeat: false, incrementMeeting: false };
  if (meeting.used.wakes >= meeting.budget.wakes) {
    return { wake: false, pauseForAustin: reviewNeeded, reason: "meeting wake budget spent", incrementSeat: false, incrementMeeting: false };
  }
  return { wake: true, reason: base.reason, incrementSeat: true, incrementMeeting: true };
}

// room_advance: the conductor's "pass the stick" decision. Stops if the meeting
// budget is exhausted (pause for Austin); otherwise routes to the next speaker,
// flagging a reclaimed (timed-out) stick and a new round on a wrap.
export function advanceStick(meeting, seats, opts = {}) {
  const { currentTurnStartedAtMs = 0, nowMs = 0, atMention = null, pingPong = { count: 0 } } = opts;
  const bs = budgetStatus(meeting);
  if (bs.level === "stop") {
    return { action: "stop", reason: "meeting budget exhausted — pause for Austin", budget: bs };
  }
  const currentSeat = seats.find((s) => s.name === meeting.currentSeat) || null;
  const stick = stickExpired(meeting, currentSeat, currentTurnStartedAtMs, nowMs);
  const ns = nextSpeaker(meeting, seats, { atMention, pingPong });
  return {
    action: "advance",
    next: ns.seat,
    roundAdvance: ns.roundAdvance,
    wakeNeeded: ns.wakeNeeded || false,
    stickExpired: stick.expired,
    reason: ns.reason,
    budget: bs,
  };
}

// Ping-pong detection for @-mention routing (P1d). Counts how many trailing
// @-mention hops have stayed within the SAME two seats (A<->B). nextSpeaker
// caps at 3 and hands the stick back to the chair. `hops` is [{from, to}, ...].
export function pingPongCount(hops) {
  if (!hops || hops.length === 0) return 0;
  const last = hops[hops.length - 1];
  const pair = new Set([last.from, last.to]);
  if (pair.size !== 2) return 0;
  let count = 0;
  for (let i = hops.length - 1; i >= 0; i--) {
    const h = hops[i];
    if (pair.has(h.from) && pair.has(h.to) && h.from !== h.to) count++;
    else break;
  }
  return count;
}
