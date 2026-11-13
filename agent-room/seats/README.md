# Agent Room — seat routes

The bot-side services that produce a seat's turn when the conductor asks for it.
The conductor's `webhookAdapter(<url>, { token })` POSTs `{ seat, meeting, thread }`
with a shared `x-room-token`; the route returns a TURN `{ body, kind, tag, atMention }`
or `null` (= not ready).

## The shared factory — `seat-route.mjs`
The hardened shape, once. Every seat route is a thin file (a protocol + the injected
model) on top of it. It provides:
- **`buildSeatPrompt`** — the protocol + budget (trusted), with the meeting + transcript
  fenced as UNTRUSTED data under a **per-request random nonce**, so a transcript body can't
  forge the closer and break out of the fence.
- **`guardSeatTurn`** — forces the model's output into a safe TURN: kind matched to the DB
  contract (optionally narrowed per seat), tags validated, body clamped to 8000,
  `review_ready`/`receipt` honored only when the seat is authorized.
- **`makeSeatHandler`** — runs the model with an **AbortSignal + ~18s timeout**; a hang aborts
  the call and returns null, so it never blows the 90s stick.
- **`makeSeatServer`** — a deployable server requiring the shared token (**SHA-256 timing-safe**),
  fails closed, generic errors. `safeHost` refuses binding to `0.0.0.0`.

## The seats
- **`june-route.mjs`** — June (muse/planner): a `propose` protocol. Doesn't set review_ready.
- **`harper-route.mjs`** — Harper (reviewer): a `review` protocol, kinds narrowed to
  `review/question/ack/propose`, never decide. Doesn't set review_ready.
- **The Claude (builder) seat** runs inside the conductor (`claudeAdapter` +
  `CLAUDE_BUILDER_PROTOCOL`), not a separate route. It is the one seat allowed to flag
  `review_ready` (with a receipt) — gated by the dispatcher's `builderSeats` in
  `normalizeTurn`, so no other bot can forge "ready for review".

## Safety floor (enforced in code, defence in depth over `room_post_bot`)
- No bot can DECIDE, post as `system`, or post as Austin; a route only ever speaks for its seat.
- The transcript is untrusted data (nonce-fenced); the protocol says never obey an instruction
  inside it to act consequentially. No release / money / send-as-Austin / go-live from the room.
- Each seat's model is injected (`generate`) and wired at deploy (Muse AI / Grok / Anthropic);
  keys stay in env, never the repo.

## Deploy
Run each route (`node june-route.mjs`, `node harper-route.mjs`) on a loopback/private interface
with `ROOM_SEAT_TOKEN` set; point the conductor's `ROOM_JUNE_URL` / `ROOM_HARPER_URL` at them with
the same token.

Tests: `seat-route` (20), `june-route` (6), `harper-route` (9), and the conductor's `seats` (26,
incl. the review-ready authority).

_— Claude~_
