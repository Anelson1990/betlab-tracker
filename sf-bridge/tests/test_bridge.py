"""Tests for sf-bridge. Pure-logic checks plus an end-to-end run against a fake
SpiderFoot. Run: python3 tests/test_bridge.py
"""
import json
import os
import sys
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bridge  # noqa: E402

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


print("token_ok")
check("valid bearer", bridge.token_ok("Bearer s3cret", "s3cret"))
check("wrong token", not bridge.token_ok("Bearer nope", "s3cret"))
check("no header", not bridge.token_ok(None, "s3cret"))
check("non-bearer scheme", not bridge.token_ok("Basic s3cret", "s3cret"))
check("empty server token refuses", not bridge.token_ok("Bearer x", ""))

print("parse_api")
check("scanlist", bridge.parse_api("/api/scanlist") == ("scanlist", ""))
check("with query", bridge.parse_api("/api/scaneventresults?id=abc") == ("scaneventresults", "id=abc"))
check("non-api path", bridge.parse_api("/index.html") == (None, None))

print("allowlist")
check("scanlist is GET-allowed", "scanlist" in bridge.ALLOWED_GET)
check("savesettings is NOT allowed", "savesettings" not in bridge.ALLOWED_GET and "savesettings" not in bridge.ALLOWED_POST)
check("startscan is POST-allowed", "startscan" in bridge.ALLOWED_POST)
check("startscan is not GET-allowed", "startscan" not in bridge.ALLOWED_GET)


# --- end-to-end: fake SpiderFoot + the real bridge ---
class FakeSF(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({"endpoint": self.path}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


def serve(httpd):
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return t


sf = ThreadingHTTPServer(("127.0.0.1", 0), FakeSF)
serve(sf)
sf_port = sf.server_address[1]

br = ThreadingHTTPServer(("127.0.0.1", 0), bridge.Handler)
br.token = "tok123"
br.sf_base = f"http://127.0.0.1:{sf_port}"
serve(br)
br_port = br.server_address[1]
base = f"http://127.0.0.1:{br_port}"


def req(path, token=None, method="GET"):
    r = urllib.request.Request(base + path, method=method)
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


print("end-to-end")
code, body = req("/api/scanlist", token="tok123")
check("authed allowed GET -> 200", code == 200)
check("forwarded to the right SF endpoint", json.loads(body).get("endpoint") == "/scanlist")
check("no token -> 401", req("/api/scanlist")[0] == 401)
check("wrong token -> 401", req("/api/scanlist", token="bad")[0] == 401)
check("disallowed endpoint -> 403", req("/api/savesettings", token="tok123")[0] == 403)
check("static index served without token", req("/")[0] == 200)

sf.shutdown()
br.shutdown()
print(f"\n{ok} passed, {bad} failed")
sys.exit(1 if bad else 0)
