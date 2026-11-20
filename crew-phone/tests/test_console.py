"""Console-wiring tests: proposal -> bridge_job -> Face-ID approval -> execute.
Run: python3 tests/test_console.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from crewphone import Action, Gate, Policy, action_fingerprint, ALLOW, PROPOSE  # noqa: E402
from crewphone.console import ConsoleGate, PhoneProposal, mint_approval  # noqa: E402

ok = 0
bad = 0


def check(name, cond):
    global ok, bad
    if cond:
        ok += 1
        print("  ok  " + name)
    else:
        bad += 1
        print("FAIL  " + name)


class FakeStore:
    """Stand-in for the Supabase bridge_jobs store. `approve()` is the Console side
    after Austin's Face-ID tap; it mints the token with the chair key."""
    def __init__(self, chair_key):
        self.jobs = {}
        self.n = 0
        self.chair_key = chair_key

    def file(self, job):
        self.n += 1
        jid = f"job-{self.n}"
        self.jobs[jid] = dict(job, approval=None)
        return jid

    def approval(self, jid):
        return self.jobs.get(jid, {}).get("approval")

    def approve(self, jid):  # Console side: Austin tapped Approve (Face ID)
        j = self.jobs[jid]
        j["status"] = "approved"
        j["approval"] = mint_approval(self.chair_key, j["fingerprint"])


CHAIR = b"chair-key-held-by-console-and-harness-not-the-agent"
POL = Policy(mode="assist", app_allowlist=frozenset({"com.example.shop"}))
gate = Gate(policy=POL, chair_key=CHAIR)
buy = Action("tap", app="com.example.shop", target_text="Buy now", target_verified=True)

print("console wiring")
store = FakeStore(CHAIR)
cg = ConsoleGate(store)

# 1. Gate proposes -> harness files a bridge_job.
d = gate.decide(buy)
check("consequential -> PROPOSE", d.verdict == PROPOSE)
jid = cg.file_proposal(PhoneProposal(d.fingerprint, "Buy now in com.example.shop", "com.example.shop", "Buy now"))
check("filed a phone_action bridge_job", store.jobs[jid]["kind"] == "phone_action")
check("job starts pending", store.jobs[jid]["status"] == "pending")

# 2. Before Austin taps: no approval, action still can't run.
check("no approval yet", cg.fetch_approval(jid) is None)
check("still PROPOSE without approval", gate.decide(buy, approval=cg.fetch_approval(jid)).verdict == PROPOSE)

# 3. Austin taps Approve (Face ID) -> Console mints the token -> harness runs it.
store.approve(jid)
appr = cg.fetch_approval(jid)
check("approval present after Face-ID tap", isinstance(appr, str) and len(appr) == 64)
check("approved action now ALLOWed", gate.decide(buy, approval=appr).verdict == ALLOW)

# 4. That approval only unlocks THIS action.
other = Action("tap", app="com.example.shop", target_text="Delete account", target_verified=True)
check("approval doesn't unlock a different action", gate.decide(other, approval=appr).verdict == PROPOSE)

# 5. An agent minting with the wrong key can't forge a valid approval.
forged = mint_approval(b"agent-guessed-key", action_fingerprint(buy))
check("wrong-key mint is not accepted", gate.decide(buy, approval=forged).verdict == PROPOSE)

print(f"\n{ok} passed, {bad} failed")
sys.exit(1 if bad else 0)
