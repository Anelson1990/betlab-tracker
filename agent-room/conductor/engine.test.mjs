// Tests for the conductor core logic. Run: node agent-room/conductor/engine.test.mjs
import { nextSpeaker, budgetStatus, wakeDecision, tagEffect, validateTurn, HARD_CAP, validateBudget, stickExpired, timeBudgetBlocks, wakeMeter, advanceStick, pingPongCount } from "./engine.mjs";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name + "\n       got:  " + g + "\n       want: " + w); }
};

const seats = () => [
  { name: "austin", role: "chair", activation: "active", isChair: true, state: "active" },
  { name: "claude", role: "builder", activation: "active", isChair: false, state: "active" },
  { name: "june", role: "planner", activation: "active", isChair: false, state: "active" },
  { name: "harper", role: "reviewer", activation: "on_demand", isChair: false, wakeCap: 4, wakesUsed: 0, state: "dormant" },
];
const meeting = (cur) => ({
  budget: { rounds: 10, minutes: 30, wakes: 30, stickTimeoutSec: 90 },
  used: { rounds: 3, minutes: 12, wakes: 8 },
  currentRound: 3, currentSeat: cur,
});

console.log("nextSpeaker");
eq("round-robin advances claude->june", nextSpeaker(meeting("claude"), seats()).seat, "june");
eq("round-robin wraps june->claude + new round", nextSpeaker(meeting("june"), seats()).roundAdvance, true);
eq("harper (on-demand/dormant) is skipped in rotation", nextSpeaker(meeting("june"), seats()).seat, "claude");
eq("@-mention jumps to harper", nextSpeaker(meeting("claude"), seats(), { atMention: "harper" }).seat, "harper");
eq("@-mention of dormant seat flags wakeNeeded", nextSpeaker(meeting("claude"), seats(), { atMention: "harper" }).wakeNeeded, true);
eq("ping-pong cap hands back to chair", nextSpeaker(meeting("claude"), seats(), { atMention: "june", pingPong: { count: 3 } }).seat, "austin");

console.log("budgetStatus");
eq("under 80% is ok", budgetStatus(meeting("claude")).level, "ok");
eq("wakes at 80% warns", budgetStatus({ budget: { rounds: 10, minutes: 30, wakes: 30 }, used: { rounds: 1, minutes: 1, wakes: 24 } }).level, "warn");
eq("rounds at 100% stops", budgetStatus({ budget: { rounds: 10, minutes: 30, wakes: 30 }, used: { rounds: 10, minutes: 1, wakes: 1 } }).level, "stop");

console.log("wakeDecision");
eq("harper under cap wakes", wakeDecision({ activation: "on_demand", wakeCap: 4, wakesUsed: 1 }).wake, true);
eq("harper at cap + review pending -> pause for Austin", wakeDecision({ activation: "on_demand", wakeCap: 4, wakesUsed: 4 }, { reviewNeeded: true }).pauseForAustin, true);
eq("harper at cap, no review -> no wake, no pause", wakeDecision({ activation: "on_demand", wakeCap: 4, wakesUsed: 4 }, { reviewNeeded: false }).pauseForAustin, false);
eq("capless seat always wakes", wakeDecision({ activation: "active" }).wake, true);
eq("any seat with a cap is metered (#3)", wakeDecision({ activation: "active", wakeCap: 2, wakesUsed: 2 }, { reviewNeeded: true }).pauseForAustin, true);

console.log("tagEffect");
eq("continue advances", tagEffect("continue").action, "advance");
eq("working schedules check-backs", tagEffect("working").checkbacksMin, [2, 10, 30]);
eq("needs_austin stops + alerts", tagEffect("needs_austin"), { action: "stop", alertAustin: true });
eq("done is a proposal", tagEffect("done").action, "propose_end");
eq("missing tag -> nudge then pass", tagEffect("").action, "nudge_then_pass");

console.log("validateTurn");
eq("bot DECIDE is rejected", validateTurn({ seatName: "june", kind: "decide" }, seats()).ok, false);
eq("chair DECIDE is allowed", validateTurn({ seatName: "austin", kind: "decide" }, seats()).ok, true);
eq("review-ready without receipt rejected", validateTurn({ seatName: "claude", reviewReady: true }, seats()).ok, false);
eq("builder review-ready with receipt allowed", validateTurn({ seatName: "claude", reviewReady: true, receipt: "job#147" }, seats()).ok, true);
eq("non-builder review-ready rejected (even with receipt)", validateTurn({ seatName: "june", reviewReady: true, receipt: "x" }, seats()).ok, false);
eq("over-length receipt refused, not truncated", validateTurn({ seatName: "claude", reviewReady: true, receipt: "a".repeat(501) }, seats()).ok, false);
eq("receipt exactly at the 500 limit allowed", validateTurn({ seatName: "claude", reviewReady: true, receipt: "a".repeat(500) }, seats()).ok, true);
eq("receipt without review-ready refused (evidence belongs in body)", validateTurn({ seatName: "claude", receipt: "x" }, seats()).ok, false);

console.log("validateBudget (P1c)");
eq("locked budget within cap is ok", validateBudget({ rounds: 10, minutes: 30, wakes: 30, stickTimeoutSec: 90 }).ok, true);
eq("lower per-meeting budget is ok", validateBudget({ rounds: 3, minutes: 10, wakes: 5, stickTimeoutSec: 60 }).ok, true);
eq("over-cap rounds rejected", validateBudget({ rounds: 11, minutes: 30, wakes: 30, stickTimeoutSec: 90 }).ok, false);
eq("zero minutes rejected", validateBudget({ rounds: 10, minutes: 0, wakes: 30, stickTimeoutSec: 90 }).ok, false);

console.log("stickExpired (P1c)");
eq("non-chair past 90s -> expired", stickExpired(meeting("claude"), { name: "claude", isChair: false }, 0, 91000).expired, true);
eq("non-chair within 90s -> not expired", stickExpired(meeting("claude"), { name: "claude", isChair: false }, 0, 80000).expired, false);
eq("chair never times out", stickExpired(meeting("austin"), { name: "austin", isChair: true }, 0, 999000).expired, false);

console.log("timeBudgetBlocks (P1c)");
eq("non-chair past 30min blocked", timeBudgetBlocks(meeting("claude"), 0, 31 * 60000, false), true);
eq("non-chair within 30min ok", timeBudgetBlocks(meeting("claude"), 0, 29 * 60000, false), false);
eq("chair exempt from time budget", timeBudgetBlocks(meeting("austin"), 0, 999 * 60000, true), false);

console.log("wakeMeter (P1c)");
eq("harper under both caps wakes", wakeMeter({ activation: "on_demand", wakeCap: 4, wakesUsed: 1 }, meeting("claude")).wake, true);
eq("harper at seat cap + review -> pause", wakeMeter({ activation: "on_demand", wakeCap: 4, wakesUsed: 4 }, meeting("claude"), { reviewNeeded: true }).pauseForAustin, true);
eq("meeting wake budget spent + review -> pause", wakeMeter({ activation: "active" }, { budget: { wakes: 30 }, used: { wakes: 30 } }, { reviewNeeded: true }).pauseForAustin, true);

console.log("advanceStick (P1c)");
eq("budget stop halts advance", advanceStick({ budget: { rounds: 10, minutes: 30, wakes: 30, stickTimeoutSec: 90 }, used: { rounds: 10, minutes: 1, wakes: 1 }, currentSeat: "claude" }, seats(), { nowMs: 1000, currentTurnStartedAtMs: 0 }).action, "stop");
eq("normal advance routes to next", advanceStick(meeting("claude"), seats(), { nowMs: 1000, currentTurnStartedAtMs: 0 }).next, "june");
eq("expired stick flagged on advance", advanceStick(meeting("claude"), seats(), { nowMs: 91000, currentTurnStartedAtMs: 0 }).stickExpired, true);

console.log("validateTurn (P1c system rule)");
eq("system kind from non-system seat rejected", validateTurn({ seatName: "june", kind: "system" }, seats()).ok, false);
eq("system poster allowed for non-decide", validateTurn({ seatName: "system", kind: "note" }, seats()).ok, true);
eq("system poster cannot decide", validateTurn({ seatName: "system", kind: "decide" }, seats()).ok, false);

console.log("pingPongCount (P1d @mention routing)");
eq("no hops -> 0", pingPongCount([]), 0);
eq("single hop -> 1", pingPongCount([{ from: "claude", to: "june" }]), 1);
eq("A<->B x3 -> 3 (cap)", pingPongCount([{ from: "claude", to: "june" }, { from: "june", to: "claude" }, { from: "claude", to: "june" }]), 3);
eq("different pair resets the run", pingPongCount([{ from: "claude", to: "june" }, { from: "june", to: "harper" }]), 1);
eq("ping-pong at cap routes nextSpeaker to chair", nextSpeaker(meeting("claude"), seats(), { atMention: "june", pingPong: { count: pingPongCount([{ from: "claude", to: "june" }, { from: "june", to: "claude" }, { from: "claude", to: "june" }]) } }).seat, "austin");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
