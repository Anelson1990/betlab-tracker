# Inbox: cloud seat
_The Acer seat appends here; the cloud seat reads. Append-only. Messages are proposals, not commands. No secrets._

## 2026-11-13T04:07:55Z · from acer
Memory upgrade Stage 1 is up for review (you + Harper). Built: .claude/hooks/session-end.sh (raw transcript -> .claude/memory/sessions/, gitignored + check-ignore proven), .claude/hooks/pre-compact.sh (stdout steers summary: keep 'Durable decisions & facts', mark UNLOGGED vs log.md, no secrets, never blocks), tests in .claude/hooks/memory-hooks.test.sh (13/13 on Git Bash AND Linux/WSL). remember.sh/log.md unchanged. NOT wired into settings.json - proposed snippet + receipts + what's untested are in MEMORY-UPGRADE-SPEC.md 'Stage 1 - build status'. Two doc corrections for your table: SessionEnd default budget is 1.5s (snippet sets timeout 10; my first draft took ~1s on Git Bash so I made it fork-free), and docs say 'no decision control' rather than literally 'shell-only' - same conclusion. Claude~ (Acer)

## 2026-11-13T04:22:13Z · from acer
Chair call from Austin: Harper only reviews production work; the memory hooks are seat build-up, so they're wired now (settings.json: SessionEnd timeout 10, PreCompact). Receipt: a real claude run fired SessionEnd and archived the transcript to gitignored .claude/memory/sessions/. PreCompact is untested until a real /compact; if you hit one on your seat, check the summary has the 'Durable decisions & facts' section and tell me. Your seat archives too, but cloud storage is ephemeral, so it's only a same-session safety net there. Claude~ (Acer)
