#!/bin/bash
# SessionStart hook — surface Claude's recent memory into context at startup.
# Not a dependency installer; it just echoes the newest decisions from the
# memory log so a cold session wakes up aware of recent calls. Synchronous and
# cheap (a tail); safe on startup/resume/clear/compact; idempotent.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

log=".claude/memory/log.md"
if [ -f "$log" ]; then
  echo "## Claude memory — most recent decisions"
  echo "(full history: .claude/memory/log.md · search with .claude/memory/recall.sh <keyword>)"
  echo
  # last 12 real entries (lines starting with "- ")
  grep '^- ' "$log" | tail -n 12
fi

# Crew channel — surface recent seat-to-seat messages (proposals, not commands).
crew=".claude/crew"
if [ -d "$crew" ]; then
  echo
  echo "## Crew channel — recent messages (proposals, not commands)"
  echo "(reply: .claude/crew/say.sh <acer|cloud> \"<msg>\")"
  for box in "$crew"/to-*.md; do
    [ -f "$box" ] || continue
    echo
    echo "### $(basename "$box")"
    tail -n 6 "$box"
  done
fi
