# Claude's memory

A simple, durable memory that lives in Austin's git — no third-party service, no
remote spool. Two layers:

1. **`/CLAUDE.md`** — curated standing facts + the "where we left off" bookmark.
   Auto-loads at the start of every session, so a cold session wakes up briefed.
2. **`log.md`** (here) — append-only, grep-able history of granular decisions.

## Use
- Save: `.claude/memory/remember.sh "tags" "note"`
- Search: `.claude/memory/recall.sh keyword`  (no arg → last 20 lines)

## How to run it (for future-Claude)
- When something durable is decided, **`remember`** it (one line, cheap).
- Starting cold or unsure of a past call? **`recall <keyword>`** before asking Austin.
- Keep `/CLAUDE.md`'s "where we left off" bookmark current at the end of a work block.

## Honest limits
- This is **semi-automatic**: cheap to write, automatic to recall — but it only
  captures what gets written. There's no background note-taker. That's a deliberate
  trade for robustness (claude-mem's auto-capture needed a local store that the
  cloud wipes + a remote spool we didn't trust).
- **Optional upgrade (not installed):** a SessionStart hook that echoes the latest
  `log.md` lines at startup so recall is automatic. It changes session-start
  behavior, so it only goes in with Austin's ok.
