#!/usr/bin/env python3
"""PreToolUse release-gate hook — DRAFT, intentionally NOT registered in settings.

The seat-local half of the console's release gate. It runs OUTSIDE the model, as
a shell command the harness invokes before a tool executes, so unlike a CLAUDE.md
instruction it cannot be talked past by prompt injection or a clever argument.

Rule: if a tool call would EXECUTE a release-shaped action (call bridge_release_job /
console_release / the shared release core), block it unless a fresh console-issued
authorization token file is present — i.e. unless Austin's Face ID tap just opened
a release window. Everything else passes untouched.

This is defense-in-depth for any Claude Code seat that holds DB/exec tools: even a
compromised or injected seat can't fire a release on its own.
"""
import json, os, re, sys, time

TOKEN_FILE = os.environ.get("CLAUDE_RELEASE_TOKEN_FILE", os.path.expanduser("~/.claude/.release-authorized"))
FRESH_SECONDS = int(os.environ.get("CLAUDE_RELEASE_FRESH_SECONDS", "120"))

# Tools that can actually RUN a release (not read/edit a file that mentions one).
EXEC_TOOLS = {"Bash"}
def _is_exec(tool: str) -> bool:
    return tool in EXEC_TOOLS or tool.endswith("execute_sql") or tool.endswith("apply_migration")

# The specific release primitives. Curate this list before activation.
RELEASE = re.compile(r"bridge_release_job|console_release|_bridge_release_core")


def _allow():
    sys.exit(0)


def _block(reason: str):
    # Newer PreToolUse block form + exit 2 as a fallback signal. Verify the exact
    # field against the current hooks docs for the installed version before wiring.
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))
    sys.exit(2)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        # Unparsable payload: not identifiable as a release, so don't block normal
        # work. (Fail-mode is a review decision — flagged in the README.)
        _allow()

    tool = data.get("tool_name", "")
    tool_input = json.dumps(data.get("tool_input", data.get("input", {})))

    if _is_exec(tool) and RELEASE.search(tool_input):
        try:
            if time.time() - os.path.getmtime(TOKEN_FILE) <= FRESH_SECONDS:
                _allow()  # a fresh Face-ID-opened window → permit this release
        except OSError:
            pass  # no token file at all
        _block("release-shaped action blocked: no fresh console authorization "
               "(Austin's Face ID tap must open a release window first)")

    _allow()


if __name__ == "__main__":
    main()
