// Agent Room — conductor RUNTIME loop (P1, DRAFT for review).
//
// Drives one meeting on the live board by calling the P1/P1c/P1d wrappers applied
// + verified in switchboard-sandbox (public.room_*). Decisions come from
// engine.mjs; this module is the thin I/O + loop around it.
//
// CONNECTION (P1d): the conductor connects as the dedicated role room_conductor
// (NOT room_app, NOT service_role — both are refused by advance/wake/pass_to).
// room_conductor is LOGIN, NOINHERIT, conn limit 5, 8s timeout, EXECUTE only on
// the six wrappers below, no table/schema access. Connect via the Supabase
// session pooler (port 5432), user room_conductor.<project_ref>, sslmode=require,
// supplied as CONDUCTOR_DATABASE_URL. The password stays on Harper's box and is
// wired in at deploy time — never in this repo. Keep the pool at <= 5.
//
// NOT RUN HERE: needs CONDUCTOR_DATABASE_URL + a live meeting; the conductor
// wrappers now refuse every session but room_conductor, so there is no cloud
// smoke-test path. This file is `node --check`-ed; the engine it uses is
// unit-tested (47/47).
//
// Bot-turn CONTENT delivery (how June / Harper / Claude actually produce a turn)
// is the host-supplied `getTurn` hook, stubbed for P1 — the "wire June's
// room-posting route" milestone.

import pg from "pg";
import { budgetStatus, tagEffect, validateTurn, nextSpeaker, pingPongCount } from "./engine.mjs";

export function makeConductor({ connectionString = process.env.CONDUCTOR_DATABASE_URL, pool } = {}) {
  const db = pool || new pg.Pool({ connectionString, max: 5, statement_timeout: 8000 });
  const pp = new Map(); // meetingId -> { hops: [{from,to}] }  (@-mention ping-pong tracking)

  async function call(fn, args) {
    const ph = args.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await db.query(`select public.${fn}(${ph}) as result`, args);
    return rows[0].result;
  }
  const state = (id) => call("room_meeting_state", [id]);
  const thread = (id, limit = 50) => call("room_thread_read", [id, limit]);
  const advance = (id, reason) => call("room_advance", [id, reason]); // 'yield' | 'timeout' (round-robin / timeouts)
  const passTo = (id, seat) => call("room_pass_to", [id, seat]); // @-mention jump / ping-pong -> chair
  const wake = (id, seat, reviewPending) => call("room_wake_seat", [id, seat, reviewPending]);
  const postBot = (id, seat, body, kind = "propose", tag = null, receipt = null, reviewReady = false) =>
    call("room_post_bot", [id, seat, body, kind, tag, receipt, reviewReady]);
  const postSystem = (id, body) => postBot(id, "system", body, "system");

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

  // One driver tick. `getTurn(seat, ctx)` is the host hook producing a bot turn
  // { body, kind?, tag?, receipt?, reviewReady?, atMention? }; null = still working.
  async function tick(meetingId, { getTurn } = {}) {
    const st = await state(meetingId);
    const m = st.meeting;
    if (!m) { pp.delete(meetingId); return { done: true, reason: "no such meeting" }; }
    if (m.status === "paused") return { done: false, paused: true, reason: m.pause_reason, needsAustin: true };
    if (m.status !== "active") { pp.delete(meetingId); return { done: true, reason: `meeting ${m.status}`, endedReason: m.ended_reason }; }

    const eng = toEngine(m, st.seats);
    const budget = budgetStatus(eng.meeting);
    const chairName = (st.seats.find((s) => s.is_chair) || {}).name;

    if (!m.current_seat) {
      return { done: false, started: true, advanced: await advance(meetingId, "yield"), budget };
    }

    const seat = st.seats.find((s) => s.name === m.current_seat) || null;
    if (seat && seat.is_chair) return { done: false, waitingForChair: true, budget };

    const turn = getTurn ? await getTurn(m.current_seat, { readThread: () => thread(meetingId), meeting: m, seats: st.seats }) : null;
    if (turn == null) return { done: false, waitingForSeat: m.current_seat, budget };

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
    if (eff.action === "propose_end") {
      await postSystem(meetingId, `[system] ${m.current_seat} proposes DONE — chair confirms against the brief`);
      return { done: false, proposedEnd: true, waitingForChair: true, seat: m.current_seat, budget };
    }

    // Route the stick. An @-mention jumps to a specific seat via room_pass_to
    // (with the ping-pong cap handing back to the chair); otherwise normal
    // round-robin via room_advance.
    const atMention = turn.atMention || null;
    if (atMention && st.seats.some((s) => s.name === atMention)) {
      const tr = pp.get(meetingId) || { hops: [] };
      tr.hops.push({ from: m.current_seat, to: atMention });
      if (tr.hops.length > 6) tr.hops.shift();
      pp.set(meetingId, tr);
      const ns = nextSpeaker(eng.meeting, eng.seats, { atMention, pingPong: { count: pingPongCount(tr.hops) } });
      const target = st.seats.find((s) => s.name === ns.seat) || null;
      if (ns.wakeNeeded || (target && !target.is_chair && target.state !== "active")) {
        await wake(meetingId, ns.seat, false);
      }
      if (ns.seat === chairName) pp.delete(meetingId); // cap hit -> back to chair, reset the run
      return { done: false, posted: m.current_seat, routedTo: ns.seat, via: "pass_to", reason: ns.reason, routed: await passTo(meetingId, ns.seat), budget };
    }
    pp.delete(meetingId); // a non-@mention turn breaks any ping-pong run
    return { done: false, posted: m.current_seat, advanced: await advance(meetingId, "yield"), budget };
  }

  // Host's 90s stick-timeout timer. The board refuses it if the stick hasn't
  // expired or the holder is the chair — safe to call.
  async function onStickTimeout(meetingId) {
    try { return { advanced: await advance(meetingId, "timeout") }; }
    catch (e) { return { refused: String(e.message || e) }; }
  }

  const wakeSeat = (meetingId, seat, reviewPending = false) => wake(meetingId, seat, reviewPending);

  return { tick, onStickTimeout, wakeSeat, state, thread, postSystem, _db: db };
}
