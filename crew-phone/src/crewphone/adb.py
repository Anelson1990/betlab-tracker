"""Minimal adb command construction for the op vocabulary. Builders are pure (they
return the argv after `adb`), so they're testable with no device; run() executes.

Learned from phone-harness's Android backend (MIT, inspiration only — no code or
dependency taken): screencap for capture, `uiautomator dump` for the UI tree (text,
so no OCR on Android), `input` for tap/swipe/text/keyevent, `am start`/`monkey` to
open an app, `pm list packages`. Every command pins one device by serial.

LIVE execution runs where adb can reach the phone (June's box / Austin's machine,
USB or Wireless debugging) — never from the ephemeral cloud seat.
"""
from __future__ import annotations

import subprocess


def _base(serial: str) -> list[str]:
    return ["-s", serial]


def cmd_capture(serial: str) -> list[str]:
    return _base(serial) + ["exec-out", "screencap", "-p"]  # PNG bytes to stdout


def cmd_ui_dump(serial: str) -> list[str]:
    return _base(serial) + ["shell", "uiautomator", "dump", "/sdcard/crewphone_ui.xml"]


def cmd_ui_read(serial: str) -> list[str]:
    return _base(serial) + ["shell", "cat", "/sdcard/crewphone_ui.xml"]


def cmd_tap(serial: str, x: int, y: int) -> list[str]:
    return _base(serial) + ["shell", "input", "tap", str(x), str(y)]


def cmd_swipe(serial: str, x1: int, y1: int, x2: int, y2: int, ms: int = 300) -> list[str]:
    return _base(serial) + ["shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(ms)]


def cmd_text(serial: str, text: str) -> list[str]:
    # adb `input text` splits on spaces; %s is the documented space escape.
    # Known limit for v0: punctuation that the shell mangles is out of scope.
    return _base(serial) + ["shell", "input", "text", text.replace(" ", "%s")]


def cmd_keyevent(serial: str, key: str) -> list[str]:
    return _base(serial) + ["shell", "input", "keyevent", str(key)]


def cmd_open_app(serial: str, pkg: str) -> list[str]:
    return _base(serial) + ["shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"]


def cmd_list_apps(serial: str) -> list[str]:
    return _base(serial) + ["shell", "pm", "list", "packages"]


def run(argv: list[str], adb: str = "adb", timeout: int = 60, binary: bool = False):
    r = subprocess.run([adb, *argv], capture_output=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"adb {' '.join(argv)} failed: {r.stderr.decode('utf-8', 'ignore').strip()}")
    return r.stdout if binary else r.stdout.decode("utf-8", "ignore")
