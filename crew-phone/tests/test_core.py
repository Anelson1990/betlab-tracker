"""Zero-dependency tests for the crew phone guardrail.
Run: PYTHONPATH=src python3 tests/test_core.py   (or just python3 tests/test_core.py)
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from crewphone import (Action, Audit, Gate, Policy, Session, action_fingerprint,  # noqa: E402
                       classify, ALLOW, PROPOSE, DENY, SAFE, CONSEQUENTIAL, BLOCKED)

ok = 0
bad = 0


def eq(name, got, want):
    global ok, bad
    if got == want:
        ok += 1
        print("  ok  " + name)
    else:
        bad += 1
        print(f"FAIL  {name}\n       got:  {got!r}\n       want: {want!r}")


# Policies
RO = Policy(mode="read_only", app_allowlist=frozenset({"com.example.notes"}))
ASSIST = Policy(mode="assist", app_allowlist=frozenset({"com.example.notes", "com.example.shop"}))

print("classify")
eq("read op always safe", classify(Action("read_screen"), RO).level, SAFE)
eq("write in read_only -> blocked", classify(Action("tap", app="com.example.notes", target_text="OK", target_verified=True), RO).level, BLOCKED)
eq("unknown op -> blocked", classify(Action("teleport"), ASSIST).level, BLOCKED)
eq("write in non-allowlisted app -> blocked", classify(Action("tap", app="com.evil.app", target_text="OK", target_verified=True), ASSIST).level, BLOCKED)
eq("sensitive app -> consequential", classify(Action("tap", app="com.chase.bank", target_text="OK", target_verified=True), Policy(mode="assist", app_allowlist=frozenset({"com.chase.bank"}))).level, CONSEQUENTIAL)
eq("tap unverified target -> consequential (fail closed)", classify(Action("tap", app="com.example.notes", coords=(10, 20)), ASSIST).level, CONSEQUENTIAL)
eq("tap on 'Buy now' -> consequential", classify(Action("tap", app="com.example.shop", target_text="Buy now", target_verified=True), ASSIST).level, CONSEQUENTIAL)
eq("tap on 'Settings' -> safe nav", classify(Action("tap", app="com.example.notes", target_text="Settings", target_verified=True), ASSIST).level, SAFE)
eq("type password -> consequential", classify(Action("type", app="com.example.notes", field_kind="password", text="x"), ASSIST).level, CONSEQUENTIAL)
eq("type normal text -> safe", classify(Action("type", app="com.example.notes", field_kind="text", text="hi"), ASSIST).level, SAFE)

print("gate + unforgeable approval")
g_nokey = Gate(policy=ASSIST)  # no chair key
g = Gate(policy=ASSIST, chair_key=b"chair-secret-held-by-console-only")
buy = Action("tap", app="com.example.shop", target_text="Buy now", target_verified=True)
safe_tap = Action("tap", app="com.example.notes", target_text="Settings", target_verified=True)

eq("safe -> allow", g.decide(safe_tap).verdict, ALLOW)
eq("blocked -> deny", g.decide(Action("tap", app="com.evil.app", target_text="x", target_verified=True)).verdict, DENY)
eq("consequential, no approval -> propose", g.decide(buy).verdict, PROPOSE)
eq("consequential, valid chair approval -> allow", g.decide(buy, approval=g.issue_approval(buy)).verdict, ALLOW)
eq("approved decision carries approved=True", g.decide(buy, approval=g.issue_approval(buy)).approved, True)

# The attack: an agent knows the fingerprint algorithm and passes the raw fingerprint
# as the "approval". Without the chair key it is NOT a valid approval.
eq("agent-computed fingerprint is NOT a valid approval", g.decide(buy, approval=action_fingerprint(buy)).verdict, PROPOSE)
# An approval minted for a DIFFERENT action does not unlock this one.
other = Action("tap", app="com.example.shop", target_text="Delete account", target_verified=True)
eq("approval bound to another action -> propose", g.decide(buy, approval=g.issue_approval(other)).verdict, PROPOSE)
# No chair key configured -> can't issue, can't approve.
eq("no chair key -> consequential stays propose", g_nokey.decide(buy, approval="anything").verdict, PROPOSE)
eq("fingerprint is stable", action_fingerprint(buy), action_fingerprint(buy))

print("session (executor injected; proposals never execute)")
calls = []
fake_exec = lambda action: (calls.append(action.op) or f"ran {action.op}")


def fresh_session(policy, key=b"k"):
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".log")
    tmp.close()
    return Session("SERIAL", Gate(policy=policy, chair_key=key), Audit(tmp.name), executor=fake_exec), tmp.name


s, logp = fresh_session(ASSIST)
calls.clear()
r = s.request(buy)  # consequential, no approval
eq("consequential request -> proposal returned", r.verdict, PROPOSE)
eq("consequential request NOT executed", calls, [])
eq("proposal has a chair-approval summary", "CHAIR APPROVAL NEEDED" in r.proposal.summary, True)

calls.clear()
r2 = s.request(safe_tap)
eq("safe request executed", r2.verdict, ALLOW)
eq("safe request ran on device", calls, ["tap"])

calls.clear()
r3 = s.request(buy, approval=s.gate.issue_approval(buy))
eq("chair-approved consequential executes", r3.verdict, ALLOW)
eq("approved consequential ran on device", calls, ["tap"])

# audit trail is written
with open(logp) as f:
    lines = [ln for ln in f if ln.strip()]
eq("audit log has entries", len(lines) >= 4, True)
os.unlink(logp)

print("adb builders")
from crewphone import adb  # noqa: E402
eq("tap argv", adb.cmd_tap("S", 100, 200), ["-s", "S", "shell", "input", "tap", "100", "200"])
eq("text escapes spaces with %s", adb.cmd_text("S", "hi there"), ["-s", "S", "shell", "input", "text", "hi%sthere"])
eq("capture is exec-out screencap", adb.cmd_capture("S"), ["-s", "S", "exec-out", "screencap", "-p"])

print(f"\n{ok} passed, {bad} failed")
sys.exit(1 if bad else 0)
