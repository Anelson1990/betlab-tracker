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

import Anthropic from "@anthropic-ai/sdk";
import { makeConductor } from "./runtime.mjs";
import { makeDispatcher, webhookAdapter, claudeAdapter } from "./seats.mjs";
import { makeClaudeComplete } from "./claude-complete.mjs";

const MEETING_ID = process.env.MEETING_ID;
const TICK_MS = Number(process.env.TICK_MS || 4000);
if (!MEETING_ID) { console.error("MEETING_ID not set"); process.exit(1); }

// The Claude (builder) seat. The prompt is built + fenced inside makeClaudeComplete
// (same nonce-fenced, untrusted-transcript treatment as the other seats). The
// Anthropic client is constructed HERE (the only place with the SDK dep); the
// model id comes from env (ROOM_CLAUDE_MODEL) — a strong model, since this seat
// does the security-critical build/review reasoning. No client/model -> the seat
// is "not ready" and never fabricates a turn.
const anthropic = (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) ? new Anthropic() : null;
if (!anthropic) console.warn("WARN: no Anthropic credential in env — the Claude seat will stay 'not ready'.");
if (!process.env.ROOM_CLAUDE_MODEL) console.warn("WARN: ROOM_CLAUDE_MODEL not set — the Claude seat will stay 'not ready'.");
const claudeComplete = makeClaudeComplete({ client: anthropic, model: process.env.ROOM_CLAUDE_MODEL });

const conductor = makeConductor({ connectionString: process.env.CONDUCTOR_DATABASE_URL });
const getTurn = makeDispatcher({
  claude: claudeAdapter(claudeComplete),
  june: webhookAdapter(process.env.ROOM_JUNE_URL, { token: process.env.ROOM_SEAT_TOKEN }),
  harper: webhookAdapter(process.env.ROOM_HARPER_URL, { token: process.env.ROOM_SEAT_TOKEN }),
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
