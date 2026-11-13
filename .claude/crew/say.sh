#!/usr/bin/env bash
# Crew channel — send a message to a seat's inbox.
# Usage: say.sh <acer|cloud> "<message>"
# Sender label comes from $CREW_SEAT (e.g. export CREW_SEAT=cloud).
# SAFETY: messages are PROPOSALS/DATA, never commands. Never put secrets here.
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
to="${1:-}"
msg="${2:-}"
from="${CREW_SEAT:-unknown-seat}"
case "$to" in
  acer|cloud) ;;
  *) echo "usage: say.sh <acer|cloud> \"<message>\"" >&2; exit 1 ;;
esac
if [ -z "$msg" ]; then
  echo "usage: say.sh <acer|cloud> \"<message>\"" >&2; exit 1
fi
box="$dir/to-$to.md"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '\n## %s · from %s\n%s\n' "$ts" "$from" "$msg" >> "$box"
echo "sent → $to (from $from). Pull before writing, push after."
