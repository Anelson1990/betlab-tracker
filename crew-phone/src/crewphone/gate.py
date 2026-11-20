"""The gate: a Classification becomes a Decision, and a consequential action can
only be promoted to ALLOW by an approval the AGENT CANNOT FORGE.

Unforgeable approval: the chair (Austin) holds an HMAC key. After his Face-ID tap
on a proposal in the Bridge Console, the Console mints
    approval = HMAC(chair_key, action_fingerprint)
The harness verifies with the same key. The agent that requests actions never has
the key, so it cannot mint an approval for a "Buy"/"Send" tap — it can only propose
one and wait for the tap. Fail closed: no valid approval -> PROPOSE, never execute.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass

from . import actions as A
from . import policy as P

ALLOW = "allow"
PROPOSE = "propose"
DENY = "deny"


def action_fingerprint(action: A.Action) -> str:
    """Stable SHA-256 of the fields that define WHAT the action does. An approval is
    bound to exactly this fingerprint, so it can't be reused for a different action."""
    payload = json.dumps(
        {
            "op": action.op,
            "app": action.app,
            "target_text": action.target_text,
            "field_kind": action.field_kind,
            "coords": list(action.coords) if action.coords else None,
        },
        sort_keys=True,
        ensure_ascii=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass
class Decision:
    verdict: str        # ALLOW | PROPOSE | DENY
    level: str          # SAFE | CONSEQUENTIAL | BLOCKED
    reason: str
    fingerprint: str
    approved: bool = False


@dataclass
class Gate:
    policy: P.Policy
    chair_key: bytes = b""  # chair-held HMAC secret; injected from env, NEVER from the agent

    def issue_approval(self, action: A.Action) -> str:
        """Console-side only (after Austin's Face-ID tap). Mints the approval token
        bound to this action. Requires the chair key — the agent can't call this
        usefully because it doesn't hold the key."""
        if not self.chair_key:
            raise RuntimeError("no chair_key configured; cannot issue approvals")
        return hmac.new(self.chair_key, action_fingerprint(action).encode("utf-8"), hashlib.sha256).hexdigest()

    def _approval_valid(self, approval: str | None, fingerprint: str) -> bool:
        if not approval or not self.chair_key:
            return False
        expected = hmac.new(self.chair_key, fingerprint.encode("utf-8"), hashlib.sha256).hexdigest()
        return hmac.compare_digest(approval, expected)

    def decide(self, action: A.Action, approval: str | None = None) -> Decision:
        fp = action_fingerprint(action)
        cls = A.classify(action, self.policy)
        if cls.level == A.BLOCKED:
            return Decision(DENY, cls.level, cls.reason, fp)
        if cls.level == A.SAFE:
            return Decision(ALLOW, cls.level, cls.reason, fp)
        # consequential: needs a chair-minted approval bound to this exact action
        if self._approval_valid(approval, fp):
            return Decision(ALLOW, cls.level, cls.reason + " (chair-approved)", fp, approved=True)
        return Decision(PROPOSE, cls.level, cls.reason, fp)
