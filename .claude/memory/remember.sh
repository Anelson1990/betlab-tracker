#!/usr/bin/env bash
# Save a durable memory line to the log.
# Usage: .claude/memory/remember.sh "tag1,tag2" "the thing to remember"
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
tags="${1:-general}"
shift || true
note="$*"
if [ -z "${note// }" ]; then
  echo "usage: remember.sh <tags> <note>" >&2
  exit 1
fi
printf -- '- %s · [%s] · %s\n' "$(date +%F)" "$tags" "$note" >> "$dir/log.md"
echo "remembered → [$tags] $note"
