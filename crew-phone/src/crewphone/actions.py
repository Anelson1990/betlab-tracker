"""The action a seat (Claude / Harper) asks the phone to perform, and how it is
classified. Pure logic — no device, no I/O — so the classifier is fully testable.

An Action names WHAT and (for a tap) WHICH element, from the uiautomator tree. A
raw-coordinate tap with no verified target can't be proven safe, so it classifies
as consequential (fail closed) — the agent can't sneak a "Buy" tap through as a
bare x,y.
"""
from __future__ import annotations

from dataclasses import dataclass

from . import policy as P

SAFE = "safe"
CONSEQUENTIAL = "consequential"
BLOCKED = "blocked"


@dataclass
class Action:
    op: str                       # one of READ_OPS | WRITE_OPS
    app: str | None = None        # package the action targets, when known
    target_text: str | None = None  # text/content-desc of the tapped element (from the tree)
    target_verified: bool = False   # True only when target_text came from the UI tree, not a guess
    field_kind: str | None = None   # for 'type': 'text' | 'password' | 'payment'
    text: str | None = None         # text to type (not logged verbatim if sensitive)
    coords: tuple[int, int] | None = None


@dataclass
class Classification:
    level: str          # SAFE | CONSEQUENTIAL | BLOCKED
    reason: str


def classify(action: Action, policy: P.Policy) -> Classification:
    op = action.op

    if op not in P.READ_OPS and op not in P.WRITE_OPS:
        return Classification(BLOCKED, f"unknown op: {op!r}")

    # Reads never change state — always safe (even in read_only mode).
    if op in P.READ_OPS:
        return Classification(SAFE, "read-only op")

    # From here: a WRITE op.
    if policy.mode == "read_only":
        return Classification(BLOCKED, "harness is in read_only mode; writes are off")

    # App scope: a write op in a non-allowlisted app is blocked outright.
    if action.app is not None and not policy.app_allowed(action.app):
        return Classification(BLOCKED, f"app not in allowlist: {action.app}")

    # Acting inside a sensitive app (bank, messaging, settings, …) is consequential.
    if policy.is_sensitive_app(action.app):
        return Classification(CONSEQUENTIAL, f"sensitive app: {action.app}")

    if op == "type":
        if action.field_kind in ("password", "payment"):
            return Classification(CONSEQUENTIAL, f"typing into a {action.field_kind} field")
        return Classification(SAFE, "typing into a normal field")

    if op == "tap":
        if not action.target_verified or action.target_text is None:
            # Can't prove what this tap hits -> treat as consequential (fail closed).
            return Classification(CONSEQUENTIAL, "tap target not verified from the UI tree")
        if policy.text_is_consequential(action.target_text):
            return Classification(CONSEQUENTIAL, f"consequential control: {action.target_text!r}")
        return Classification(SAFE, f"navigational tap: {action.target_text!r}")

    if op == "open_app":
        # Allowed + non-sensitive (checked above) -> opening is safe navigation.
        return Classification(SAFE, f"open app: {action.app}")

    # swipe / keyevent: navigation unless it slipped past the checks above.
    return Classification(SAFE, f"{op} (navigation)")
