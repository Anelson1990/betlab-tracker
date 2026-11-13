#!/bin/bash
# SessionEnd hook — raw safety net for memory (Stage 1 of MEMORY-UPGRADE-SPEC.md).
#
# On session end, copy the session transcript into .claude/memory/sessions/
# (GITIGNORED — raw transcripts can hold secrets; local recovery material only)
# and append one marker line to sessions/index.log.
#
# What this hook CANNOT do (per code.claude.com/docs/en/hooks, SessionEnd):
# no decision control, JSON output is discarded, and there is no model turn —
# it can't make Claude write a summary. Curated memory stays remember.sh -> log.md.
#
# Input (stdin JSON): session_id, transcript_path, cwd, hook_event_name, reason.
# Budget: SessionEnd hooks default to 1.5s total — this is one cp, kept cheap.
# Portable: bash + sed/grep only (no jq/python), runs on Git Bash and Linux.
# Never fails the session: every error path exits 0 with a note on stderr.
set -u

proj="${CLAUDE_PROJECT_DIR:-.}"
dest="$proj/.claude/memory/sessions"
payload="$(cat)"

# Pull a top-level string field out of the flat hook JSON. Handles the only
# escapes a path/id realistically carries (\\ and \/); anything else -> empty.
# Pure-bash (no subprocess forks) — Git Bash forks are slow and the SessionEnd
# budget is 1.5s by default.
field() {
  local re="\"$1\"[[:space:]]*:[[:space:]]*\"(([^\"\\\\]|\\\\[\\\\/])*)\""
  REPLY=""
  [[ "$payload" =~ $re ]] || return 0
  REPLY="${BASH_REMATCH[1]//\\\//\/}"
  REPLY="${REPLY//\\\\/\\}"
}

field session_id;      sid="$REPLY"
field transcript_path; tpath="$REPLY"
field reason;          reason="$REPLY"
ts="$(date -u +%Y%m%dT%H%M%SZ)"

# session_id goes into a filename -> allow only safe characters (no traversal).
case "$sid" in
  ''|*[!A-Za-z0-9_-]*) echo "session-end: missing/unsafe session_id; nothing archived" >&2; exit 0 ;;
esac
case "$reason" in *[!A-Za-z0-9_-]*) reason="unknown" ;; esac

# Windows paths (C:\...) -> POSIX for Git Bash; no-op on Linux.
if command -v cygpath >/dev/null 2>&1 && [ -n "$tpath" ]; then
  tpath="$(cygpath -u "$tpath" 2>/dev/null || printf '%s' "$tpath")"
fi

case "$tpath" in
  *.jsonl) ;;
  *) echo "session-end: transcript_path not a .jsonl; nothing archived" >&2; exit 0 ;;
esac
if [ ! -f "$tpath" ]; then
  echo "session-end: transcript not found; nothing archived" >&2; exit 0
fi

mkdir -p "$dest" || exit 0
out="$dest/${ts}_${sid}.jsonl"
if cp "$tpath" "$out" 2>/dev/null; then
  printf '%s · session %s · reason %s · archived %s\n' "$ts" "$sid" "${reason:-unknown}" "$(basename "$out")" >> "$dest/index.log"
else
  echo "session-end: copy failed; nothing archived" >&2
fi
exit 0
