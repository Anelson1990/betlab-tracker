# Agent Room P1 — deploy runbook

**Status: code APPROVED + deploy-ready (Harper, 119+ tests). Austin said GO —
switchboard-sandbox (`dylxjeyvyurhmlfpxgcg`) ONLY. Never jessica-core.**
Sandbox first. Nothing goes live off a room turn; Face ID stays required for
anything consequential.

## Who runs this — and why not the cloud seat
The live run needs a **persistent process** and **secrets** (DB passwords, the
Anthropic key). The cloud (ephemeral) seat can do neither safely:
- it's reclaimed when the session ends, so a conductor loop started here dies with it;
- secrets must never enter the repo, a commit, **or chat** — so the cloud seat
  must not be handed the `room_conductor` / `room_reader` passwords or the API key.

So the cloud seat's job is **all the code + this pack** (done). The live run is:
- **Conductor + June/Harper seat servers → the Acer seat** (Austin's laptop:
  persistent, secrets live in a local `.env` that's gitignored). Or any host
  Austin controls.
- **Read endpoint + room-view → a host reachable by Harper's phone** (Vercel per
  the plan), same-origin so the page can fetch `/room-state.json` (artifact CSP).
Secrets are set in that host's env / local `.env`, by Austin — never pasted to a seat.

## Prereqs (done)
- DB on **switchboard-sandbox**: P1 schema, P1b wrappers + `room_app`, P1c
  advance/wake, P1d `room_pass_to` + `room_conductor`, P1f (seated-builder +
  non-empty-receipt). Applied by Harper.
- Roles for the run: **conductor → `room_conductor`**, **read endpoint + room-view
  → `room_reader`** (confirmed by Harper; code + docs now use `room_reader`).
- Code: conductor engine + runtime + getTurn dispatcher + hardened seat routes +
  the Claude-seat `complete()` wired (`conductor/claude-complete.mjs`). 119+ tests.

## Secrets — env only (see `.env.example`; never commit real values)
Set on the host that runs each service, by Austin:
- `CONDUCTOR_DATABASE_URL` — `room_conductor` via the session pooler, sslmode=require.
- `ROOM_READER_DATABASE_URL` — `room_reader` via the session pooler, sslmode=require.
- `ANTHROPIC_API_KEY` (or an `ant auth login` profile) + `ROOM_CLAUDE_MODEL` (the
  current strong model id — see the claude-api skill; do not downgrade this seat).
- `ROOM_SEAT_TOKEN`, `ROOM_JUNE_URL`, `ROOM_HARPER_URL`, `MEETING_ID`.

## Steps (sandbox first)
1. `cd agent-room && npm install` (pulls `@anthropic-ai/sdk`, `pg`; confirm current
   versions at install). `npm test` → all suites green.
2. **Seed a meeting** on sandbox (one meeting row + its seats). This can be done
   from the cloud seat via the Supabase MCP (sandbox write, in scope) OR by the
   Acer seat — it yields the `MEETING_ID` the services use. (Needs the room schema;
   seed austin=chair, claude=builder, june=planner, harper=reviewer/on-demand.)
3. **Seat servers** (`npm run seat:june`, `npm run seat:harper`): bind **localhost**
   (`safeHost` refuses `0.0.0.0`/`::`), auth on `x-room-token`; front with TLS.
4. **Conductor** (`npm run conductor`): connects as `room_conductor`. The wrappers
   refuse any session that isn't `room_conductor`. The Claude seat uses the strong
   model from `ROOM_CLAUDE_MODEL`; with no key/model it stays "not ready" (safe).
5. **Read endpoint / room-view** (`npm run room-view`): connects as `room_reader`,
   read-only, serves the page + `/room-state.json`. Host same-origin, reachable by
   Harper's phone (Vercel).
6. **Live smoke test (Harper):** a seat posts; forged `decide`/`system`/non-builder
   `review_ready`/orphan or over-500 receipt all get refused; budgets
   (10 rounds / 30 min / 30 wakes / 90s stick) pause to Austin at cap; room-view
   shows real data, not the Preview. Then hand back the room-view URL + MEETING_ID.

## Hard floor (unchanged)
- Bots post only via `room_post_bot` (conductor path); the chair posts via
  `room_post_austin`. Only the chair DECIDEs. review_ready is builder-only + a
  receipt (app side + P1f at the DB).
- No release, money, send under Austin's name, or go-live from inside the room —
  chair-only with Face ID. **Nothing goes live off a room turn.**

_— Claude~_
