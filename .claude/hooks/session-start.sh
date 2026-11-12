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
