#!/usr/bin/env bash
# Crew channel — read an inbox. Usage: inbox.sh [acer|cloud] (defaults to $CREW_SEAT)
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
seat="${1:-${CREW_SEAT:-}}"
if [ -z "$seat" ]; then
  echo "(no seat given and CREW_SEAT unset — showing both inboxes)"
  for f in "$dir"/to-*.md; do
    [ -f "$f" ] || continue
    echo "=== $(basename "$f") ==="
    cat "$f"
    echo
  done
  exit 0
fi
cat "$dir/to-$seat.md"
