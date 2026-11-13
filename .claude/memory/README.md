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
- **SessionStart hook (installed):** echoes the latest `log.md` lines at startup,
  resume and after compaction, so recall is automatic.
- **Stage 1 safety net (built, NOT yet registered — awaiting Harper):**
  `hooks/session-end.sh` archives raw transcripts to `sessions/` (gitignored, local
  only — may hold secrets); `hooks/pre-compact.sh` steers compaction summaries to keep
  decisions and flag `UNLOGGED` ones. Details, receipts and the proposed `settings.json`
  snippet: `MEMORY-UPGRADE-SPEC.md` → "Stage 1 — build status".
