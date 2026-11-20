"""Bridge Console wiring for the consequential-action gate.

When the gate PROPOSES, the harness files a `bridge_job` — the crew's existing
Face-ID approval primitive, already live on the Console. Austin sees it on his phone
and taps Approve (Face ID). The Console then mints
    approval = HMAC(chair_key, action_fingerprint)
and attaches it to the job. The harness reads the approved job and replays the action
WITH that approval, so gate.decide() lets it run. No new approval path — it rides the
bridge_jobs floor (jessica-core in prod, switchboard-sandbox for testing).

The JobStore is injected (a Supabase-backed store in deploy; a fake in tests), so
this module — the harness side — is testable with no DB.

Key separation (see SECURITY.md F2): the Console holds chair_key to MINT after Face
ID; the harness holds it to VERIFY. Neither is on the agent's surface. A documented
hardening is to move approvals to asymmetric signatures (Console signs with a private
key, the harness verifies with only the public key) so a compromised harness still
can't mint — that needs a crypto dep, so v0 keeps the symmetric HMAC the gate uses.
"""
from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass


@dataclass
class PhoneProposal:
    fingerprint: str
    summary: str
    app: str | None = None
    target: str | None = None


def mint_approval(chair_key: bytes, fingerprint: str) -> str:
    """CONSOLE side only, after Austin's Face-ID tap. Needs chair_key."""
    if not chair_key:
        raise RuntimeError("no chair_key; the Console cannot mint an approval")
    return hmac.new(chair_key, fingerprint.encode("utf-8"), hashlib.sha256).hexdigest()


class ConsoleGate:
    """Harness side. `store` implements:
        file(job: dict) -> job_id
        approval(job_id) -> str | None   # the minted token once Austin approved, else None
    """

    def __init__(self, store):
        self.store = store

    def file_proposal(self, p: PhoneProposal) -> str:
        return self.store.file({
            "kind": "phone_action",
            "fingerprint": p.fingerprint,
            "summary": p.summary,
            "app": p.app,
            "target": p.target,
            "status": "pending",
            "filed_at": int(time.time()),
        })

    def fetch_approval(self, job_id: str) -> str | None:
        """The minted approval token once Austin has tapped Approve, else None."""
        return self.store.approval(job_id)
