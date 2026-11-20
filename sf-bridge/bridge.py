#!/usr/bin/env python3
"""sf-bridge — a thin, authed phone front-door to a local SpiderFoot (OSS) server.

SpiderFoot OSS binds to localhost and, without a passwd file, has NO auth (it warns
you to add some), so it must never face a phone directly. This bridge runs on the
SAME box as SpiderFoot and:
  - serves a mobile web app (add-to-home-screen) SAME-ORIGIN, so no CORS;
  - requires a bearer token on every /api/* call (the auth SpiderFoot lacks);
  - forwards only an ALLOWLIST of SpiderFoot's JSON endpoints to 127.0.0.1:5001.

Reach it from your phone over a PRIVATE tunnel (Tailscale / WireGuard) — never put it
on the public internet. Authorized OSINT only.

Env: SFBRIDGE_TOKEN (required), SF_BASE (default http://127.0.0.1:5001),
     BRIDGE_HOST (default 127.0.0.1), BRIDGE_PORT (default 8600).
"""
from __future__ import annotations

import hmac
import os
import sys
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

WEB = Path(__file__).parent / "web"

# SpiderFoot endpoints the phone may reach. Read + scan-control only; settings,
# savesettings, vacuum, reset are deliberately NOT here.
ALLOWED_GET = {
    "ping", "scanlist", "scanstatus", "scansummary", "scaneventresults",
    "scaneventresultsunique", "scanlog", "scanerrors", "scanhistory",
    "modules", "eventtypes", "correlationrules", "stopscan", "scandelete", "rerunscan",
}
ALLOWED_POST = {"startscan"}


def token_ok(auth_header: str | None, token: str) -> bool:
    if not token or not auth_header:
        return False
    parts = auth_header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return False
    return hmac.compare_digest(parts[1], token)


def parse_api(path: str):
    """/api/<endpoint>[?query] -> (endpoint, query) or (None, None) for non-api paths."""
    p = urllib.parse.urlsplit(path)
    if not p.path.startswith("/api/"):
        return None, None
    return p.path[len("/api/"):].strip("/"), p.query


def forward(sf_base: str, endpoint: str, method: str, query: str, body: bytes, ctype: str, timeout: int = 120):
    url = sf_base.rstrip("/") + "/" + endpoint
    if query:
        url += "?" + query
    req = urllib.request.Request(url, method=method)
    if method == "POST":
        req.data = body or b""
        req.add_header("Content-Type", ctype or "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get("Content-Type", "application/json"), r.read()


class Handler(BaseHTTPRequestHandler):
    server_version = "sf-bridge"

    def _send(self, code: int, ctype: str, body: bytes):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _static(self, name: str, ctype: str):
        f = WEB / name
        if not f.is_file():
            return self._send(404, "text/plain", b"not found")
        self._send(200, ctype, f.read_bytes())

    def _api(self, method: str):
        endpoint, query = parse_api(self.path)
        if endpoint is None:
            return self._send(404, "text/plain", b"not found")
        if not token_ok(self.headers.get("Authorization"), self.server.token):
            return self._send(401, "application/json", b'{"error":"unauthorized"}')
        allowed = ALLOWED_GET if method == "GET" else ALLOWED_POST
        if endpoint not in allowed:
            return self._send(403, "application/json", b'{"error":"endpoint not allowed"}')
        body = b""
        if method == "POST":
            n = int(self.headers.get("Content-Length", 0) or 0)
            body = self.rfile.read(n) if n else b""
        try:
            code, ctype, rbody = forward(
                self.server.sf_base, endpoint, method, query, body, self.headers.get("Content-Type", "")
            )
            self._send(code, ctype, rbody)
        except Exception:
            self._send(502, "application/json", b'{"error":"spiderfoot unreachable"}')

    def do_GET(self):
        sp = urllib.parse.urlsplit(self.path).path
        if sp in ("/", "/index.html"):
            return self._static("index.html", "text/html; charset=utf-8")
        if sp == "/manifest.webmanifest":
            return self._static("manifest.webmanifest", "application/manifest+json")
        return self._api("GET")

    def do_POST(self):
        return self._api("POST")

    def log_message(self, *args):
        pass  # quiet


def main():
    token = os.environ.get("SFBRIDGE_TOKEN", "")
    if not token:
        print("SFBRIDGE_TOKEN not set — refusing to start an unauthenticated bridge.", file=sys.stderr)
        sys.exit(1)
    sf_base = os.environ.get("SF_BASE", "http://127.0.0.1:5001")
    host = os.environ.get("BRIDGE_HOST", "127.0.0.1")
    port = int(os.environ.get("BRIDGE_PORT", "8600"))
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.token = token
    httpd.sf_base = sf_base
    print(f"sf-bridge on {host}:{port} -> {sf_base}  (reach it from your phone over a PRIVATE tunnel)")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
