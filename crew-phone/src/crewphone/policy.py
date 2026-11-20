"""Policy: what the crew phone harness is allowed to do, and what is gated.

The whole point of this harness (vs. raw phone-harness) is the CONSEQUENTIAL-ACTION
GATE: an agent may read and navigate freely, but anything that spends money, sends
on Austin's behalf, approves, installs, or deletes is REFUSED at execution time and
turned into a proposal that needs Austin's Face-ID tap (the Bridge Console floor).

Fail closed: when the harness cannot prove an action is safe, it treats it as
consequential. Defaults are conservative; a deployment narrows or widens them in
one place, here.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Substrings (lowercase) in a tapped element's text / content-description that mark
# a consequential control. Over-broad on purpose — over-gating is the safe failure.
CONSEQUENTIAL_KEYWORDS = frozenset({
    "buy", "pay", "purchase", "order", "checkout", "place order", "confirm",
    "subscribe", "sign up", "send", "transfer", "withdraw", "deposit",
    "delete", "remove", "uninstall", "install", "approve", "accept", "agree",
    "pay now", "book", "reserve", "rent", "call", "dial", "post", "publish",
    "share", "log out", "sign out", "unlock", "continue to payment", "add card",
})

# App package substrings where ACTING (tap/type) is always consequential — money,
# messaging, settings, accounts. Reading (screenshot/tree) stays safe.
SENSITIVE_APP_HINTS = frozenset({
    "bank", "chase", "wellsfargo", "citi", "capitalone", "paypal", "venmo",
    "cash", "coinbase", "robinhood", "wallet", "com.android.settings",
    "messaging", "messages", "mms", "sms", "dialer", "com.android.phone",
    "gmail", "mail", "outlook", "whatsapp", "telegram", "signal", "messenger",
})

# Read-only op vocabulary — never changes device state.
READ_OPS = frozenset({"capture", "read_screen", "scroll", "navigate", "list_apps"})
# Write op vocabulary — can change state; subject to mode + the gate.
WRITE_OPS = frozenset({"tap", "type", "swipe", "keyevent", "open_app"})


@dataclass
class Policy:
    # "read_only": only READ_OPS run; every write op is denied.
    # "assist":    write ops run, but consequential ones become proposals.
    mode: str = "read_only"
    # Apps the agent may touch at all. Empty = none allowed (fail closed) except reads.
    app_allowlist: frozenset[str] = field(default_factory=frozenset)
    consequential_keywords: frozenset[str] = CONSEQUENTIAL_KEYWORDS
    sensitive_app_hints: frozenset[str] = SENSITIVE_APP_HINTS

    def app_allowed(self, app: str | None) -> bool:
        if not app:
            return True  # op not targeting a specific app (e.g. a plain read)
        a = app.lower()
        return any(allowed.lower() in a for allowed in self.app_allowlist)

    def is_sensitive_app(self, app: str | None) -> bool:
        if not app:
            return False
        a = app.lower()
        return any(h in a for h in self.sensitive_app_hints)

    def text_is_consequential(self, text: str | None) -> bool:
        if not text:
            return False
        t = text.lower()
        return any(k in t for k in self.consequential_keywords)
