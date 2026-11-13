#!/bin/bash
# Tests for session-end.sh + pre-compact.sh (memory upgrade, Stage 1).
# Feeds realistic hook stdin payloads by hand, in a throwaway project dir.
# Run: bash .claude/hooks/memory-hooks.test.sh
dir="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ok  $1"; }
bad()  { fail=$((fail+1)); echo "FAIL  $1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

proj="$(mktemp -d)"; src="$(mktemp -d)"
mkdir -p "$proj/.claude/memory"
printf -- '- 2026-11-12 · [test] · a logged decision\n' > "$proj/.claude/memory/log.md"
printf '{"type":"user","message":"hello"}\n' > "$src/sess.jsonl"

# JSON-escape a path the way Claude Code would (backslashes doubled on Windows).
jpath() {
  local p="$1"
  command -v cygpath >/dev/null 2>&1 && p="$(cygpath -w "$p")"
  printf '%s' "$p" | sed 's/\\/\\\\/g'
}
end_payload() {  # sid  transcript_json_path  reason
  printf '{"session_id":"%s","transcript_path":"%s","cwd":"%s","hook_event_name":"SessionEnd","reason":"%s"}' \
    "$1" "$2" "$(jpath "$proj")" "$3"
}
sess="$proj/.claude/memory/sessions"
run_end() { printf '%s' "$1" | CLAUDE_PROJECT_DIR="$proj" bash "$dir/session-end.sh" 2>/dev/null; }

echo "SessionEnd"
run_end "$(end_payload abc-123 "$(jpath "$src/sess.jsonl")" prompt_input_exit)"; rc=$?
check "valid payload -> exit 0"                       '[ $rc = 0 ]'
check "archive file created"                          'ls "$sess"/*_abc-123.jsonl >/dev/null 2>&1'
check "archive identical to transcript"               'cmp -s "$src/sess.jsonl" "$(ls "$sess"/*_abc-123.jsonl | head -n1)"'
check "index.log marker written"                      'grep -q "session abc-123 · reason prompt_input_exit" "$sess/index.log"'

n_before="$(ls "$sess" | wc -l)"
run_end "$(end_payload '../../evil' "$(jpath "$src/sess.jsonl")" other)"; rc=$?
check "traversal session_id -> exit 0, nothing archived" '[ $rc = 0 ] && [ "$(ls "$sess" | wc -l)" = "$n_before" ]'
run_end "$(end_payload def-456 "$(jpath "$src/missing.jsonl")" other)"; rc=$?
check "missing transcript -> exit 0, nothing archived"   '[ $rc = 0 ] && ! ls "$sess"/*_def-456.jsonl >/dev/null 2>&1'
run_end "$(end_payload ghi-789 "$(jpath "$proj/.claude/memory/log.md")" other)"; rc=$?
check "non-.jsonl path -> exit 0, nothing archived"      '[ $rc = 0 ] && ! ls "$sess"/*_ghi-789* >/dev/null 2>&1'
run_end 'not json at all'; rc=$?
check "garbage stdin -> exit 0"                       '[ $rc = 0 ]'

echo "PreCompact"
out="$(printf '{"session_id":"abc-123","transcript_path":"x","cwd":"x","hook_event_name":"PreCompact","trigger":"auto","custom_instructions":null}' \
  | CLAUDE_PROJECT_DIR="$proj" bash "$dir/pre-compact.sh")"; rc=$?
check "exit 0 (never blocks compaction)"              '[ $rc = 0 ]'
check "asks to keep durable decisions"                'printf "%s" "$out" | grep -q "Durable decisions & facts"'
check "asks to mark UNLOGGED items"                   'printf "%s" "$out" | grep -q "UNLOGGED"'
check "includes logged entries for comparison"        'printf "%s" "$out" | grep -q "a logged decision"'
check "under 10,000 chars"                            '[ "${#out}" -lt 10000 ]'

rm -rf "$proj" "$src"
echo ""; echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
