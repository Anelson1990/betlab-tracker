# Agent Room — room-view

Phone-first live board for a meeting. One data-driven page (`index.html`) that renders
exactly what the wrappers return:
- `room_meeting_state(meeting)` → `{ meeting, seats }`
- `room_thread_read(meeting, limit)` → `[ turns ]`

It shows the talking stick (current_seat), budget meters (rounds / minutes / wakes + each
seat's wake cap), a pause banner with `pause_reason`, and the thread with kinds, tags,
receipts and review-ready flags.

## Preview vs live
- **Preview** = the published artifact (`claude.ai/artifact/7duvdSQ5DobeVvDRmGteHq`). It shows
  the embedded **sample** meeting, because a claude.ai artifact's sandbox blocks cross-origin
  `fetch`. The badge reads "Preview".
- **Live** = deploy `index.html` on the **same origin** as a read endpoint that serves the
  board state at `./room-state.json` (or wire that path to an API route). The page fetches it
  with `cache:no-store` and, on success, renders the live board and the badge reads "Live board".

## The read endpoint (to deploy)
A tiny backend that connects as **`room_app`** (which has EXECUTE on `room_meeting_state` and
`room_thread_read` — read-only, no conductor functions, no writes), calls both wrappers for the
active meeting, and returns:
```json
{ "meeting": { ... }, "seats": [ ... ], "thread": [ ... ] }
```
Use `ROOM_APP_DATABASE_URL` (session pooler, user `room_app.<project_ref>`, sslmode=require) —
the password stays off the repo, wired in at deploy time (same pattern as the console).
`room_app` cannot advance the stick, post bot/system turns, or touch tables — it only reads.

## Not here yet
- **Chair posting** (`room_post_austin`) and the **Face ID release** need the passkey/console
  integration — the input + quick chips are inert in the preview.
- **Bot-turn content** (how June / Harper / Claude produce a turn) is the conductor's `getTurn`
  hook — the next milestone.

_— Claude~_
