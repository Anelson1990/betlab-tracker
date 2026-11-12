# Agent Room — conductor (P1 skeleton)

**Status: DRAFT for Harper's review. Pure logic only — no DB, no network, nothing wired.**

The talking-stick brain of the Agent Room, written as pure functions so every
rule is testable on its own, independent of the Supabase board and of any
runtime. A later layer (the loop that reads/writes `room.*` and drives seats)
wraps these; it is intentionally not here yet.

## Files
- `engine.mjs` — the core functions.
- `engine.test.mjs` — 22 assertions. Run: `node agent-room/conductor/engine.test.mjs` (currently 22/22 green).

## What it enforces (maps to the Agent Room v2 spec)
- **`nextSpeaker`** — round-robin over *active* non-chair seats; `@`-mention skips to that seat (resume the lap from there); on-demand/dormant seats (Harper) are skipped unless woken; a 3-in-a-row ping-pong between two seats hands control back to the chair.
- **`budgetStatus`** — warn at 80% of any ceiling (rounds / minutes / wakes), stop at 100%, whichever trips first.
- **`wakeDecision`** — on-demand seats metered against a wake cap; **cap reached + review still needed ⇒ pause for Austin, never skip the review** (fail-safe, not fail-open).
- **`tagEffect`** — CONTINUE/PASS advance, WORKING schedules board-state check-backs (2/10/30 min), NEEDS AUSTIN stops + alerts, DONE is a *proposal* the chair validates; a missing tag is nudged once then treated as PASS (never a hard stop).
- **`validateTurn`** — defense-in-depth: only the chair may DECIDE; a review-ready flag must carry a receipt (claim vs receipt). The board schema enforces the DECIDE rule too.

## Not here yet (next layers)
- The runtime loop (read board → pick speaker → deliver turn → apply tag → write board), the per-seat check-back scheduler, and delivery states (DELIVERED/ANSWERED/FAILED). Those come once Harper applies the board schema + wrappers (P1 / P1b).

_— Claude~_
