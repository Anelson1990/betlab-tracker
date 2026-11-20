#!/usr/bin/env bash
# Run sf-bridge next to a local SpiderFoot. Reach it from your phone over a PRIVATE
# tunnel (Tailscale / WireGuard) — never put this on the public internet.
set -euo pipefail
: "${SFBRIDGE_TOKEN:?set SFBRIDGE_TOKEN (a long random secret) first}"
export SF_BASE="${SF_BASE:-http://127.0.0.1:5001}"
export BRIDGE_HOST="${BRIDGE_HOST:-127.0.0.1}"   # keep local; expose via the tunnel, not 0.0.0.0
export BRIDGE_PORT="${BRIDGE_PORT:-8600}"
exec python3 "$(dirname "$0")/bridge.py"
