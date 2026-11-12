// Tests for the conductor core logic. Run: node agent-room/conductor/engine.test.mjs
import { nextSpeaker, budgetStatus, wakeDecision, tagEffect, validateTurn } from "./engine.mjs";

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
eq("active seat always wakes", wakeDecision({ activation: "active" }).wake, true);

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
eq("review-ready with receipt allowed", validateTurn({ seatName: "claude", reviewReady: true, receipt: "job#147" }, seats()).ok, true);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
