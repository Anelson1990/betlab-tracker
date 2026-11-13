// Agent Room — conductor service entrypoint (DRAFT, deploy-time).
//
// Wires the runtime loop + the getTurn dispatcher and drives one meeting on a
// cadence. NOT run from the cloud seat (needs the room_conductor credential).
// `node --check` only.
//
// Env: CONDUCTOR_DATABASE_URL (room_conductor via session pooler), MEETING_ID,
//      TICK_MS (default 4000), ROOM_JUNE_URL, ROOM_HARPER_URL.
// The Claude-seat complete() is wired here — see the claude-api skill for the
// current model IDs. Security-critical reasoning stays on the strong model.

import { makeConductor } from "./runtime.mjs";
import { makeDispatcher, webhookAdapter, claudeAdapter } from "./seats.mjs";

const MEETING_ID = process.env.MEETING_ID;
const TICK_MS = Number(process.env.TICK_MS || 4000);
if (!MEETING_ID) { console.error("MEETING_ID not set"); process.exit(1); }

// TODO(deploy): wire the real Anthropic call. Returns a TURN { body, kind?, tag?,
// receipt?, reviewReady?, atMention? } or null (= still working). Until wired it
// returns null, so the Claude seat simply holds until its stick times out.
async function claudeComplete(/* ctx */) {
  return null;
}

const conductor = makeConductor({ connectionString: process.env.CONDUCTOR_DATABASE_URL });
const getTurn = makeDispatcher({
  claude: claudeAdapter(claudeComplete),
  june: webhookAdapter(process.env.ROOM_JUNE_URL),
  harper: webhookAdapter(process.env.ROOM_HARPER_URL),
});

async function loop() {
  try {
    const r = await conductor.tick(MEETING_ID, { getTurn });
    if (r.done) { console.log("meeting done:", r.reason); clearInterval(timer); conductor._db.end?.(); return; }
    if (r.paused) console.log("PAUSED (needs Austin):", r.reason);
    else if (r.needsAustin) console.log("NEEDS AUSTIN:", r.seat);
    else if (r.waitingForChair) { /* Austin holds the stick */ }
    else if (r.waitingForSeat) {
      // nobody posted; the board reclaims the stick once 90s has elapsed (it
      // refuses the call until then, so this is safe to attempt each tick).
      const to = await conductor.onStickTimeout(MEETING_ID);
      if (to.advanced) console.log("stick reclaimed (timeout)");
    } else if (r.posted) {
      console.log("posted", r.posted, r.routedTo ? "-> " + r.routedTo : (r.advanced ? "-> advanced" : ""));
    }
  } catch (e) {
    console.error("tick error:", e.message || e);
  }
}

console.log(`conductor up — meeting ${MEETING_ID}, tick ${TICK_MS}ms`);
const timer = setInterval(loop, TICK_MS);
