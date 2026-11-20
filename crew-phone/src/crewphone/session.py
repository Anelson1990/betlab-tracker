"""Session: the single entry a seat (Claude / Harper) calls to drive the phone.

request(action, approval) -> classify -> gate -> AUDIT -> then:
  SAFE / chair-approved  -> execute via adb, return output
  CONSEQUENTIAL (no OK)  -> return a Proposal (NOT executed); the chair approves it
                           in the Bridge Console (Face ID), which mints the approval
  BLOCKED                -> denied

The adb executor is injected, so all the gate logic is testable with no device.
"""
from __future__ import annotations

from dataclasses import dataclass

from . import actions as A
from . import adb as ADB
from . import gate as G
from .audit import Audit


@dataclass
class Proposal:
    fingerprint: str
    reason: str
    summary: str  # the line Austin sees in the Console


@dataclass
class Result:
    verdict: str
    level: str
    reason: str
    fingerprint: str
    output: str | None = None
    proposal: Proposal | None = None


def _summary(action: A.Action, reason: str) -> str:
    bits = [action.op]
    if action.app:
        bits.append(f"in {action.app}")
    if action.target_text:
        bits.append(f"on {action.target_text!r}")
    return f"CHAIR APPROVAL NEEDED: {' '.join(bits)} — {reason}"


class Session:
    def __init__(self, serial: str, gate: G.Gate, audit: Audit, executor=None):
        self.serial = serial
        self.gate = gate
        self.audit = audit
        self.executor = executor or adb_executor(serial)

    def request(self, action: A.Action, approval: str | None = None) -> Result:
        d = self.gate.decide(action, approval=approval)
        self.audit.record({
            "event": "decision", "op": action.op, "app": action.app,
            "target": action.target_text, "verdict": d.verdict, "level": d.level,
            "reason": d.reason, "fp": d.fingerprint, "approved": d.approved,
        })
        if d.verdict == G.DENY:
            return Result(d.verdict, d.level, d.reason, d.fingerprint)
        if d.verdict == G.PROPOSE:
            prop = Proposal(d.fingerprint, d.reason, _summary(action, d.reason))
            self.audit.record({"event": "proposal", "fp": d.fingerprint, "summary": prop.summary})
            return Result(d.verdict, d.level, d.reason, d.fingerprint, proposal=prop)
        # ALLOW -> execute
        out = self.executor(action)
        self.audit.record({"event": "executed", "op": action.op, "fp": d.fingerprint, "approved": d.approved})
        return Result(d.verdict, d.level, d.reason, d.fingerprint, output=out)


def adb_executor(serial: str, adb_bin: str = "adb"):
    """Map an allowed Action to its adb command and run it. Reads return text;
    writes return a short ok. Only reached for ALLOW verdicts."""
    def execute(action: A.Action) -> str | None:
        op = action.op
        if op == "read_screen":
            ADB.run(ADB.cmd_ui_dump(serial), adb=adb_bin)
            return ADB.run(ADB.cmd_ui_read(serial), adb=adb_bin)
        if op == "list_apps":
            return ADB.run(ADB.cmd_list_apps(serial), adb=adb_bin)
        if op == "capture":
            ADB.run(ADB.cmd_capture(serial), adb=adb_bin, binary=True)  # caller saves bytes
            return "captured"
        if op == "scroll" or op == "swipe":
            c = action.coords or (540, 1400)
            ADB.run(ADB.cmd_swipe(serial, c[0], c[1], c[0], c[1] - 800), adb=adb_bin)
            return "scrolled"
        if op == "navigate":
            ADB.run(ADB.cmd_keyevent(serial, "KEYCODE_BACK"), adb=adb_bin)
            return "navigated"
        if op == "open_app":
            ADB.run(ADB.cmd_open_app(serial, action.app), adb=adb_bin)
            return f"opened {action.app}"
        if op == "tap":
            c = action.coords or (0, 0)
            ADB.run(ADB.cmd_tap(serial, c[0], c[1]), adb=adb_bin)
            return "tapped"
        if op == "type":
            ADB.run(ADB.cmd_text(serial, action.text or ""), adb=adb_bin)
            return "typed"
        if op == "keyevent":
            ADB.run(ADB.cmd_keyevent(serial, action.text or "KEYCODE_BACK"), adb=adb_bin)
            return "key"
        return None
    return execute
