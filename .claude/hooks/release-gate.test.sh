#!/bin/bash
# Tests for release-gate.py — verifies the allow/block decision for sample
# PreToolUse payloads. Run: bash .claude/hooks/release-gate.test.sh
dir="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0
NONE="/nonexistent-release-token-xyz"
run() {  # name  json  wantexit  [fresh_token_path]
  local name="$1" json="$2" want="$3" tf="${4:-$NONE}"
  [ "$tf" != "$NONE" ] && : > "$tf"
  printf '%s' "$json" | CLAUDE_RELEASE_TOKEN_FILE="$tf" python3 -I "$dir/release-gate.py" >/dev/null 2>&1
  local got=$?
  [ "$tf" != "$NONE" ] && rm -f "$tf"
  if [ "$got" = "$want" ]; then pass=$((pass+1)); echo "  ok  $name";
  else fail=$((fail+1)); echo "FAIL  $name (exit $got, want $want)"; fi
}
fresh="$(mktemp -u)"
run "exec + release + no token -> BLOCK"          '{"tool_name":"Bash","tool_input":{"command":"psql -c \"select console_release(x)\""}}' 2
run "exec + release + fresh token -> allow"       '{"tool_name":"Bash","tool_input":{"command":"select console_release(x)"}}'               0 "$fresh"
run "benign exec -> allow"                        '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}'                                   0
run "edit mentioning release (not exec) -> allow" '{"tool_name":"Edit","tool_input":{"new_string":"docs about console_release"}}'           0
run "execute_sql + release + no token -> BLOCK"   '{"tool_name":"mcp__Supabase__execute_sql","tool_input":{"query":"select bridge_release_job(1)"}}' 2
echo ""; echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
