#!/usr/bin/env bash
# Search the memory log (case-insensitive). No arg = show the last 20 lines.
# Usage: .claude/memory/recall.sh [keyword]
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
q="${1:-}"
if [ -z "$q" ]; then
  tail -n 20 "$dir/log.md"
else
  grep -i -- "$q" "$dir/log.md" || echo "(no memory matches \"$q\")"
fi
