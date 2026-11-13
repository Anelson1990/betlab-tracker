# Agent Room P1 — deploy runbook (DRAFT)

**Status: code APPROVED + deploy-ready (Harper, 19dfbde / HEAD 3b5cbc7, 119 tests).
Deploy itself is AUSTIN'S CALL and has not happened.** Sandbox first. Nothing goes
live off a room turn; Face ID stays required for anything consequential.

This is a checklist for when Austin says go — not a script to run unattended, and
not something the cloud seat can do alone (it needs the `room_conductor`
credential and the Anthropic key, which live off the repo).

## Prereqs (already done)
- DB on **switchboard-sandbox** (`dylxjeyvyurhmlfpxgcg`): P1 schema, P1b wrappers +
  `room_app`, P1c advance/wake, P1d `room_pass_to` + `room_conductor`, P1f
  (seated-builder + non-empty-receipt enforcement). Applied by Harper.
- Code: conductor engine + runtime + getTurn dispatcher + seat routes, all tested.

## Secrets — env only, never the repo, never chat
Held by Austin / Harper, set as environment variables on the host:
- `CONDUCTOR_DATABASE_URL` — `room_conductor` via the session pooler
  (`room_conductor.<ref>`), password on Harper's box. NOINHERIT, conn-limit 5,
  8s timeout; EXECUTE on the wrappers only, no table access.
- `ROOM_SEAT_TOKEN` — shared secret for the June/Harper seat routes
  (`x-room-token`, SHA-256 timing-safe compare in `makeSeatServer`).
- `ROOM_JUNE_URL`, `ROOM_HARPER_URL` — the seat route URLs.
- `MEETING_ID` — the seeded meeting to drive.
- The read server's connection string (see the OPEN QUESTION below).
- Anthropic API key — for the Claude builder seat (see "deploy TODO").

## Steps (sandbox first)
1. **Seat routes** bind **localhost only** (`makeSeatServer` refuses `0.0.0.0`/`::`),
   front them with the host's TLS; they auth on `x-room-token`.
2. **Conductor** (`conductor/main.mjs`) runs with `CONDUCTOR_DATABASE_URL` =
   `room_conductor`. It drives one meeting on a tick; `room_advance`/`room_wake_seat`/
   `room_pass_to`/`room_post_bot` refuse any session that isn't `room_conductor`.
3. **Read endpoint** (`room-view/server.mjs`) serves the page + `/room-state.json`
   from `room_meeting_state` + `room_thread_read`, read-only. The room-view must be
   same-origin as this endpoint (artifact CSP blocks cross-origin fetch).
4. **Deploy TODO — wire the Anthropic call** in `claudeComplete` (`conductor/main.mjs`):
   the prompt is already built via `buildSeatPrompt(CLAUDE_BUILDER_PROTOCOL, ctx)`
   (nonce-fenced, untrusted transcript). Add the API call, honor `ctx.signal`, return
   the model's JSON turn. Security-critical reasoning stays on the strong model.
   Model IDs: see the `claude-api` skill (don't hardcode from memory).
5. **Seed a meeting** on sandbox, run one end-to-end: June proposes, Claude builds +
   flags review_ready with a receipt, Harper reviews, the stick advances, budgets
   hold, the room-view renders it. Only then consider a hosted sandbox run.

## OPEN QUESTION for Harper (flagged, not resolved) — read role name
Harper's deploy note says the **read endpoint connects as `room_reader`**. But the
code (`room-view/server.mjs`) and CLAUDE.md both use **`room_app`** for the read
path. These need to agree before step 3. Two possibilities:
- `room_reader` is a **rename / new, tighter read-only role** Harper added in a later
  migration (then: update `server.mjs` + CLAUDE.md to `room_reader`), or
- it's shorthand for the existing `room_app` read path (then: no code change).

**Do not guess — confirm with Harper which role the read endpoint uses, then make
the code + docs match.** (DB roles are Harper's domain / applied via her MCP.)

## Hard floor (unchanged)
- Bots post only via `room_post_bot` (conductor/service path); the chair posts via
  `room_post_austin`. Only the chair DECIDEs. Review_ready is builder-only, with a
  receipt (app side + P1f at the DB).
- No release, money, send under Austin's name, or go-live from inside the room —
  those are chair-only with his Face ID. **Nothing goes live off a room turn.**

_— Claude~_
