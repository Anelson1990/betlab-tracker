# sf-bridge — a phone front-end for SpiderFoot (OSS)

A mobile web app (add-to-home-screen) to run and read **SpiderFoot** OSINT scans from
your phone, through a thin **authed bridge** that sits in front of your local
SpiderFoot server.

**Why a bridge, not the phone talking to SpiderFoot directly:** SpiderFoot OSS binds
to localhost and — without a passwd file — has **no authentication** (it literally
warns you to add some). Exposing it to a phone/the internet would let anyone run
scans and read your results. So the bridge, on the same box as SpiderFoot:
- serves the mobile UI **same-origin** (no CORS),
- requires a **bearer token** on every `/api/*` call (the auth SpiderFoot lacks),
- forwards only an **allowlist** of SpiderFoot's JSON endpoints (read + scan control;
  never `savesettings`/`vacuum`/`reset`).

## Status
- **Built + tested (18 tests):** token auth, endpoint allowlist, and end-to-end
  forwarding to SpiderFoot all verified (`tests/test_bridge.py`). Pure Python stdlib,
  no dependencies.
- **Needs a running SpiderFoot** (`python3 sf.py -l 127.0.0.1:5001`) on the same box.
- **Live use runs on your box** (June's / yours), reached from the phone over a tunnel.

## Run (on the box with SpiderFoot)
```bash
# 1. SpiderFoot is up on 127.0.0.1:5001  (python3 sf.py -l 127.0.0.1:5001)
# 2. pick a long random token
export SFBRIDGE_TOKEN="$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')"
echo "token: $SFBRIDGE_TOKEN"   # you'll type this into the phone once
bash run.sh                      # bridge on 127.0.0.1:8600 -> SpiderFoot
```
The bridge binds localhost by design — **do not** change it to `0.0.0.0` and port-
forward it. Reach it from your phone over a **private tunnel** instead.

## Reach it from your phone (private tunnel — pick one)
- **Tailscale** (recommended): install on the box + your phone (same tailnet), then
  open `http://<box-tailscale-ip>:8600` on the phone.
- **WireGuard / an SSH tunnel** to the box also work.
- Avoid ngrok/public URLs — that puts your OSINT data and scan controls on the
  internet behind only the token.

On the phone: open the URL → enter the token once (stored on the phone only) →
**Add to Home Screen** for an app-like icon. Tabs: **Scans** (list, status, stop/
delete) and **New scan** (target + use-case: all / footprint / investigate / passive).

## Safety
- **Authorized targets only.** SpiderFoot is OSINT/recon — run it against assets you
  own or are authorized to assess. The "passive" use-case never touches the target.
- The token is the only thing between the tunnel and your SpiderFoot. Use a long
  random one; rotate it by restarting with a new `SFBRIDGE_TOKEN`.
- `SFBRIDGE_TOKEN` is set in the environment on the box — never in the repo.

## Shape
```
sf-bridge/
  bridge.py            # the authed proxy (stdlib http.server)
  web/index.html       # the mobile app (token login, scans, new scan, detail)
  web/manifest.webmanifest
  run.sh               # convenience launcher
  tests/test_bridge.py # 18 tests
```
Built against SpiderFoot OSS endpoints (`smicallef/spiderfoot`, GPL) read from its
`sfwebui.py`: `ping`, `scanlist`, `scanstatus`, `scansummary`, `scaneventresults`,
`startscan`, `stopscan`, `scandelete`, `modules`, `eventtypes`, … No SpiderFoot code
is bundled; the bridge only talks to a running instance over HTTP.
