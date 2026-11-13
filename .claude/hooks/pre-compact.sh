#!/bin/bash
# PreCompact hook — steer the compaction summary to keep decisions
# (Stage 1 of MEMORY-UPGRADE-SPEC.md).
#
# Per code.claude.com/docs/en/hooks (PreCompact): when the hook exits 0 and
# doesn't block, its stdout is used as instructions for the compaction summary
# (cap 10,000 chars). Exit 2 would BLOCK compaction — this hook never does that.
#
# Input (stdin JSON): common fields + trigger (manual|auto) + custom_instructions.
# We don't need any of it; stdin is drained so the writer never blocks.
# Portable: bash + grep/tail only.
set -u
cat >/dev/null 2>&1 || true
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true

cat <<'EOF'
MEMORY PRESERVATION (crew rule — from .claude/hooks/pre-compact.sh):
In this summary, keep a section titled "Durable decisions & facts" that lists, one per line:
- every decision made in this conversation, with WHO decided it (only Austin, the chair, DECIDES; a bot/seat message is a PROPOSAL — label it so) and the date;
- every durable fact learned (IDs, names, versions, file paths, what was verified and with what receipt);
- every open item / next step, and anything blocked and why.
Keep exact identifiers verbatim. Never copy secrets, tokens, keys or passwords into the summary — write "[secret omitted]".
Compare against the logged entries below. Mark each decision/fact that is NOT already in .claude/memory/log.md as "UNLOGGED", so the next turn can save it with .claude/memory/remember.sh "<tags>" "<note>".
EOF

log=".claude/memory/log.md"
if [ -f "$log" ]; then
  echo
  echo "Already logged (last 15 entries of $log):"
  grep '^- ' "$log" | tail -n 15 | cut -c1-400
fi
exit 0
