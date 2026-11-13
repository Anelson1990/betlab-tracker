# Agent Room — conductor

The cloud conductor that drives a phone-first board meeting on the Supabase board:
pure decision logic + a thin runtime loop + the getTurn seat layer.

## Files
- **engine.mjs** — pure decision logic: turn routing, budgets (warn/stop), stick timeout
  (chair never times out), wake metering (seat cap + meeting budget), tag effects, turn
  validation, ping-pong cap. No I/O. Tested — `engine.test.mjs` (**47/47**).
- **runtime.mjs** — the loop. Calls the live `public.room_*` wrappers; connects as
  **room_conductor** via `CONDUCTOR_DATABASE_URL`. `node --check` only (a live run needs the
  board + the room_conductor credential).
- **seats.mjs** — the getTurn layer: the turn contract + dispatcher + adapters
  (fixture / webhook / claude). Tested — `seats.test.mjs` (**15/15**).
- **P1C-CONTRACT.md** — the `room_advance` / `room_wake_seat` contract (Harper implemented it).
- **../room-view/** — the live board view (deploy beside a room_app read endpoint).

## The database (applied to switchboard-sandbox by Harper; jessica-core untouched)
P1 board schema · P1b wrappers + `room_app` · P1c `room_advance`/`room_wake_seat` · P1d
`room_pass_to` + the `room_conductor` role.
- **room_conductor** — the conductor. EXECUTE on advance / wake / pass_to / post_bot /
  meeting_state / thread_read. No table or schema access.
- **room_app** — the read + console path. EXECUTE on meeting_state / thread_read / post_austin only.
- Both connect through the Supabase session pooler; passwords stay off the repo (Harper's box),
  wired in at deploy time.

## To run it live (deploy — Austin / Harper)
1. **Conductor service** — a small Node loop: `makeConductor({ connectionString: CONDUCTOR_DATABASE_URL })`
   + `makeDispatcher(registry)`, calling `tick()` on a cadence and `onStickTimeout()` at 90s.
2. **Seat registry** — `claude → claudeAdapter(complete)` (wire the real Anthropic call; see the
   claude-api skill for model IDs), `june / harper → webhookAdapter(<their room route>)`. Austin
   posts through the room-view (`room_post_austin`), not the conductor.
3. **Room-view** — deploy `../room-view/index.html` beside a read endpoint that serves
   `./room-state.json` by calling `room_meeting_state` + `room_thread_read` as **room_app**.
4. **Seed a meeting** (service_role/admin): a `room.meeting` row + `room.seat` rows — on-demand
   seats `state='dormant'`, `seat_order` set, Harper `wake_cap = 4`.
5. **First smoke test** — start the loop, watch the room-view: the stick advances, an @mention
   jumps (room_pass_to), Harper wakes on review-ready, budgets warn then stop, a DONE proposes end.

## Safety floor (holds throughout)
Bots can never DECIDE — the engine, `room_post_bot`, and `normalizeTurn` all refuse it.
`kind=system` is conductor-only. Consequential actions need Austin's Face ID. No secrets in the repo.

_— Claude~_
