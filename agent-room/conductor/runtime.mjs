// Agent Room — conductor RUNTIME loop (P1, DRAFT for review).
//
// Drives one meeting on the live board by calling the P1/P1c wrappers that are
// applied + verified in switchboard-sandbox (public.room_*, confirmed by reading
// their definitions 2026-11-13). Decisions come from engine.mjs; this module is
// the thin I/O + loop around it.
//
// CONNECTION: the conductor is NOT room_app. room_advance / room_wake_seat /
// room_post_bot are EXECUTE-for-service_role and explicitly refuse room_app, so
// the conductor connects with a CONDUCTOR credential (currently service_role)
// via CONDUCTOR_DATABASE_URL (transport-B style, like the console). Keep it in
// env; never in the repo.
//   SECURITY NOTE for Harper: service_role is the master key. A dedicated
//   `room_conductor` LOGIN role with EXECUTE on just the four conductor wrappers
//   would be tighter least-privilege than handing the conductor service_role.
//   Flagged, not blocking for the sandbox.
//
// NOT RUN HERE: needs CONDUCTOR_DATABASE_URL + a live meeting. This file is
// `node --check`-ed only; the engine it depends on is unit-tested (42/42).
//
// KNOWN GAP (flagged to Harper): there is no wrapper to hand the stick to a
// SPECIFIC seat, so the engine's @-mention jump and ping-pong-to-chair can't be
// realised on the board yet — room_advance's round-robin is authoritative until
// a `room_pass_to(meeting, seat)` wrapper exists. Bot-turn CONTENT delivery (how
// June / Harper / Claude actually produce a turn) is the host-supplied `getTurn`
// hook, stubbed for P1 — that's the "wire June's room-posting route" milestone.

import pg from "pg";
import { budgetStatus, tagEffect, validateTurn } from "./engine.mjs";

export function makeConductor({ connectionString = process.env.CONDUCTOR_DATABASE_URL, pool } = {}) {
  const db = pool || new pg.Pool({ connectionString, max: 4, statement_timeout: 8000 });

  // All board access is through the public wrappers (no direct table access).
  async function call(fn, args) {
    const ph = args.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await db.query(`select public.${fn}(${ph}) as result`, args);
    return rows[0].result;
  }
  const state = (id) => call("room_meeting_state", [id]);
  const thread = (id, limit = 50) => call("room_thread_read", [id, limit]);
  const advance = (id, reason) => call("room_advance", [id, reason]); // 'yield' | 'timeout'
  const wake = (id, seat, reviewPending) => call("room_wake_seat", [id, seat, reviewPending]);
  const postBot = (id, seat, body, kind = "propose", tag = null, receipt = null, reviewReady = false) =>
    call("room_post_bot", [id, seat, body, kind, tag, receipt, reviewReady]);
  const postSystem = (id, body) => postBot(id, "system", body, "system");

  // Map board rows -> engine's normalised shapes.
  function toEngine(m, seats) {
    return {
      meeting: {
        budget: { rounds: m.budget_rounds, minutes: m.budget_minutes, wakes: m.budget_wakes, stickTimeoutSec: m.stick_timeout_sec },
        used: { rounds: m.rounds_used, minutes: 0, wakes: m.wakes_used },
        currentRound: m.current_round, currentSeat: m.current_seat,
      },
      seats: seats.map((s) => ({
        name: s.name, role: s.role, activation: s.activation, isChair: s.is_chair,
        wakeCap: s.wake_cap, wakesUsed: s.wakes_used, state: s.state, seatOrder: s.seat_order,
      })),
    };
  }

  // One driver tick. Reads state, surfaces pauses, drives the current seat, and
  // advances the stick. `getTurn(seat, ctx)` is the host hook that produces a
  // bot's turn; returning null means "still working / not ready" and leaves the
  // stick in place (the host's 90s timer calls onStickTimeout).
  async function tick(meetingId, { getTurn } = {}) {
    const st = await state(meetingId);
    const m = st.meeting;
    if (!m) return { done: true, reason: "no such meeting" };
    if (m.status === "paused") return { done: false, paused: true, reason: m.pause_reason, needsAustin: true };
    if (m.status !== "active") return { done: true, reason: `meeting ${m.status}`, endedReason: m.ended_reason };

    const eng = toEngine(m, st.seats);
    const budget = budgetStatus(eng.meeting); // ok | warn | stop (host surfaces warns)

    // Fresh meeting: first advance sets started_at + the first seat (no start wrapper).
    if (!m.current_seat) {
      return { done: false, started: true, advanced: await advance(meetingId, "yield"), budget };
    }

    const seat = st.seats.find((s) => s.name === m.current_seat) || null;
    if (seat && seat.is_chair) {
      return { done: false, waitingForChair: true, budget }; // never drive the chair
    }

    const turn = getTurn ? await getTurn(m.current_seat, { readThread: () => thread(meetingId), meeting: m, seats: st.seats }) : null;
    if (turn == null) return { done: false, waitingForSeat: m.current_seat, budget };

    // Defence in depth — the board also enforces these.
    const v = validateTurn(
      { seatName: m.current_seat, kind: turn.kind || "propose", reviewReady: !!turn.reviewReady, receipt: turn.receipt },
      eng.seats
    );
    if (!v.ok) return { done: false, rejected: v.error, seat: m.current_seat, budget };

    await postBot(meetingId, m.current_seat, turn.body, turn.kind || "propose", turn.tag || null, turn.receipt || null, !!turn.reviewReady);

    const eff = tagEffect(turn.tag);
    if (eff.action === "stop") {
      await postSystem(meetingId, `[system] ${m.current_seat} flagged NEEDS AUSTIN`);
      return { done: false, needsAustin: true, seat: m.current_seat, budget };
    }
    // DONE is a proposal: post a system note; the chair confirms against the brief.
    if (eff.action === "propose_end") await postSystem(meetingId, `[system] ${m.current_seat} proposes the meeting is DONE — chair confirms against the brief`);
    return { done: false, posted: m.current_seat, tagEffect: eff, advanced: await advance(meetingId, "yield"), budget };
  }

  // Host's 90s stick-timeout timer calls this. The board refuses it if the stick
  // hasn't actually expired, or the holder is the chair — so it's safe to call.
  async function onStickTimeout(meetingId) {
    try { return { advanced: await advance(meetingId, "timeout") }; }
    catch (e) { return { refused: String(e.message || e) }; }
  }

  const wakeSeat = (meetingId, seat, reviewPending = false) => wake(meetingId, seat, reviewPending);

  return { tick, onStickTimeout, wakeSeat, state, thread, postSystem, _db: db };
}
