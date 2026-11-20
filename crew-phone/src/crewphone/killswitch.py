"""Physical STOP/GO kill switch the human holds on the phone (the APK).

When GO, the phone app publishes a short-lived, SIGNED heartbeat; the harness refuses
to do ANYTHING unless a fresh valid GO is present. STOP — or a stale, absent, or
forged heartbeat — locks agents out entirely (reads included). Fail closed.

Integrity: heartbeat = HMAC(device_key, "go|" + exp). The device_key is shared by the
phone app and the harness and is NOT on the agent's action surface, so an agent that
cannot read the harness key cannot forge a GO — it can only wait for the human to
flip the switch. If the agent has shell/filesystem access to the harness box or raw
adb to the phone, this boundary does NOT hold — see SECURITY.md threat model.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass


@dataclass
class KillState:
    go: bool
    reason: str


def sign_heartbeat(device_key: bytes, exp: int) -> str:
    return hmac.new(device_key, f"go|{exp}".encode("utf-8"), hashlib.sha256).hexdigest()


def make_heartbeat(device_key: bytes, ttl_sec: int = 10, now: int | None = None) -> dict:
    """Phone-app side: build a GO heartbeat valid for ttl_sec."""
    n = int(now if now is not None else time.time())
    exp = n + ttl_sec
    return {"state": "go", "exp": exp, "sig": sign_heartbeat(device_key, exp)}


def read_state(raw: str | None, device_key: bytes, now: int | None = None) -> KillState:
    """Parse + verify a heartbeat blob read from the phone. Fail closed on anything off."""
    n = int(now if now is not None else time.time())
    if not raw:
        return KillState(False, "no heartbeat (STOP, or the app isn't publishing)")
    try:
        d = json.loads(raw)
    except Exception:
        return KillState(False, "unreadable heartbeat")
    if not isinstance(d, dict) or d.get("state") != "go":
        return KillState(False, f"state={d.get('state') if isinstance(d, dict) else '?'!r}")
    exp = d.get("exp")
    if not isinstance(exp, int) or exp <= n:
        return KillState(False, "heartbeat expired (stale GO / STOP)")
    if not device_key:
        return KillState(False, "no device key configured")
    expected = sign_heartbeat(device_key, exp)
    if not (isinstance(d.get("sig"), str) and hmac.compare_digest(d["sig"], expected)):
        return KillState(False, "bad signature (forged GO)")
    return KillState(True, "GO")


class KillSwitch:
    """Reads + verifies the phone's heartbeat. `reader` returns the raw blob — in
    deploy: `adb exec-out run-as <pkg> cat files/go.json`. Injected for tests."""

    def __init__(self, device_key: bytes, reader):
        self.device_key = device_key
        self.reader = reader

    def state(self, now: int | None = None) -> KillState:
        try:
            raw = self.reader()
        except Exception as e:
            return KillState(False, f"reader error: {e}")  # fail closed
        return read_state(raw, self.device_key, now=now)
