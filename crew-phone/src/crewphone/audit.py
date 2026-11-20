"""Append-only audit log: every action request, its decision, and its outcome, with
a UTC timestamp. One JSON object per line. This is the evidence trail — a seat
driving the phone leaves a reviewable record, and a consequential action shows up
as a proposal (and, if it ran, the approval that let it)."""
from __future__ import annotations

import json
import time
from pathlib import Path


class Audit:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    def record(self, entry: dict) -> dict:
        stamped = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **entry}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(stamped, ensure_ascii=True) + "\n")
        return stamped
