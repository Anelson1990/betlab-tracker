# Claude's memory log

Append-only, searchable history of durable decisions and facts. One line each:
`- DATE · [tags] · note`. Add with `remember.sh`, search with `recall.sh`.
The curated standing summary lives in `/CLAUDE.md` (auto-loads each session); this
is the granular, grep-able history behind it.

- 2026-11-12 · [console] · Bridge Console LIVE on jessica-core (production): hardened gate, phone alerts (ntfy) wired, old token path closed.
- 2026-11-12 · [console,security] · Transport B chosen: app connects as console_app LOGIN role via CONSOLE_DATABASE_URL (direct pg), no service key, no JWT.
- 2026-11-12 · [console,todo] · Residual: PUBLIC on net.* (supabase_admin-owned) needs a Supabase support ticket; low-priority DB-SSRF defense-in-depth gap.
- 2026-11-12 · [agent-room,decision] · Budgets locked: 10 rounds / 30 min / 30 wakes / 90s stick-timeout; Harper wake cap ~4; pause-for-Austin at cap (fail-safe).
- 2026-11-12 · [crew] · Harper lives in Grok Bot (home), model is Claude Opus 5.5 (routed); June lives in Muse AI; Claude is this cloud session. Bench also has Quant, Builder, Finance Coach, Scout, Life Coach (all in Grok Bot).
- 2026-11-12 · [skills] · Built ai-slop-review skill (fresh, credits gstack framing); vendored agent-teams coordination skills (MIT).
- 2026-11-12 · [agent-room,build] · Conductor skeleton built + 22/22 tests pass (agent-room/conductor/, pure logic, draft for Harper).
- 2026-11-12 · [memory] · Stood up this memory system (CLAUDE.md + searchable log) instead of a third-party tool, to keep data in Austin's git.
- 2026-11-12 · [skills,agent-room,build] · Built tiered-workers skill — cost-tiered subagent crew (strong model plans/verifies, cheap workers do separable grunt work under a check gate; 2-4 not 16; security-critical stays on strong; safety floor holds). Codifies the Claude-seat-parallelizes-internally layer.
