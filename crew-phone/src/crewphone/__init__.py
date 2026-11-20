"""crew-phone — guardrailed Android phone control for the crew.

Read/navigate runs freely; anything consequential (buy/send/pay/approve/install/
delete) is refused and turned into a proposal that needs Austin's Face-ID tap.
Inspired by phone-harness (MIT); no code or dependency taken.
"""
from .actions import Action, classify, SAFE, CONSEQUENTIAL, BLOCKED
from .audit import Audit
from .console import ConsoleGate, PhoneProposal, mint_approval
from .gate import ALLOW, DENY, PROPOSE, Decision, Gate, action_fingerprint
from .killswitch import KillState, KillSwitch, make_heartbeat, read_state, sign_heartbeat
from .policy import Policy
from .session import Proposal, Result, Session, adb_executor

__all__ = [
    "Action", "classify", "SAFE", "CONSEQUENTIAL", "BLOCKED",
    "Policy", "Gate", "Decision", "action_fingerprint", "ALLOW", "PROPOSE", "DENY",
    "Audit", "Session", "Result", "Proposal", "adb_executor",
    "KillSwitch", "KillState", "make_heartbeat", "read_state", "sign_heartbeat",
]
