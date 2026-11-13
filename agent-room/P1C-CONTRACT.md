# Agent Room P1c — `room_advance` / `room_wake_seat` (contract)

**Status:** logic built + tested (cloud Claude). SQL binding pending connectors.
The authoritative behaviour is `agent-room/conductor/engine.mjs` (`advanceStick`,
`stickExpired`, `wakeMeter`, `timeBudgetBlocks`, `validateBudget`, plus the
`validateTurn` system rule) — **41/41 tests pass** (`node agent-room/conductor/engine.test.mjs`).

**Why a contract, not the SQL yet:** written while the Supabase + Notion connectors
were down, so I could not read the applied DDL (`agent_room_p1_board_schema` /
`agent_room_p1b_wrappers_room_app`) or test SQL against it. I won't ship SQL I can't
verify. **Harper:** either implement these against the live schema from this contract,
or ping me when connectors are back and I'll write + test the SQL against the real DDL.
Apply to **switchboard-sandbox only**.

## Decisions baked in (Austin, chair, 2026-11-13)
- **#2** The chair is **not** bound by the time budget, and the chair's stick **never** times out.
- **#3** Per-meeting budgets are allowed but **hard-capped at 10 / 30 / 30 / 90** (rounds/min/wakes/stick-sec). A budget axis must be `> 0` and `<= cap`.
- **#4** `kind=system` is **conductor-only** (the `system` poster); the system poster can never DECIDE.
- Stick timeout (90s) + wake metering live here in P1c.

## `room_advance(meeting)` — pass the stick
Conductor-driven. Called after a seat posts+yields, or when the 90s stick window has
elapsed with no post from the current holder.
1. **Budget stop first.** If `rounds_used >= budget_rounds`, or meeting elapsed `> budget_minutes`, or `wakes_used >= budget_wakes` → set the meeting **paused** and return (no advance). This is the pause-for-Austin fail-safe.
2. **Chair holds the stick →** no-op (never auto-advance off the chair).
3. **Otherwise advance** round-robin over **active, non-chair** seats in seat order. On a wrap (back to the first), increment `current_round` and `rounds_used`.
4. Return `(current_seat, current_round, status)`.

Mirror of `advanceStick()` + `stickExpired()` (chair-exempt) in the engine.

## `room_wake_seat(meeting, seat)` — meter a wake
Conductor-driven.
1. Active seats are always wakeable; on-demand seats (e.g. Harper, cap 4) are metered.
2. A wake must pass **both** the seat's `wake_cap` **and** the meeting's `budget_wakes`.
3. If over **either** cap **and a review is pending → do NOT wake; pause for Austin** (fail-safe, never skip the review). If over and no review pending → simply no wake.
4. On a granted wake, increment the seat's `wakes_used` **and** the meeting's `wakes_used`.
5. Return `(woke bool, pause_for_austin bool, reason)`.

Mirror of `wakeMeter()` + `wakeDecision()` in the engine.

## Security posture (match P1b)
- `SECURITY DEFINER` with `set search_path = ''` (same as `block_mutation`).
- `EXECUTE` on both functions granted to the **conductor credential only** — **not** to seat-bots, and not to `room_app` as a seat path. These drive the room; a seat-bot must never call them directly.
- No function here may post a DECIDE, fire a release, or touch anything consequential — the safety floor holds.

## Open dependency
`room_app` (like every role) can still reach `net.http_*` via pg_net's PUBLIC grant — the
known `net.*` gap; folded into the existing Supabase support ticket (needs supabase_admin).
Not a P1c blocker (defence-in-depth).

_— Claude~_
