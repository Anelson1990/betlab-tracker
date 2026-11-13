#!/usr/bin/env bash
# Agent Room — start the conductor + June/Harper seat servers on an always-on
# Linux box (Harper's box). Seats bind localhost ONLY. SANDBOX meeting.
# Nothing goes live off a room turn; chair Face ID gates anything consequential.
#
# Usage:
#   REPO=/path/to/betlab-tracker bash run-box.sh
#
# Requires agent-room/.env on THIS box, filled in from .env.example. The repo
# holds NAMES only — real values live in .env here and are never committed.
#
# Prefers pm2 (survives restarts via `pm2 save` + `pm2 startup`); falls back to a
# dependency-free bash supervisor that restarts any process that dies.
set -euo pipefail

REPO="${REPO:-$HOME/betlab-tracker}"
APP="$REPO/agent-room"
BRANCH="claude/june-laptop-door-acer-7xpif5"

[ -d "$APP" ] || { echo "agent-room not found at $APP — set REPO=/path/to/betlab-tracker"; exit 1; }
cd "$APP"

# 1. Latest reviewed code on the work branch.
git -C "$REPO" fetch origin "$BRANCH"
git -C "$REPO" checkout "$BRANCH"
git -C "$REPO" pull --ff-only origin "$BRANCH"

# 2. Install deps and gate on a green test run — refuse to start on red.
npm install
npm test

# 3. Load secrets from .env on THIS box (never from the repo).
[ -f "$APP/.env" ] || { echo "missing $APP/.env — copy .env.example and fill it in"; exit 1; }
set -a; . "$APP/.env"; set +a

# 4. Defaults: pin the seeded sandbox meeting; seats on localhost.
export MEETING_ID="${MEETING_ID:-2a9ccfaf-5faa-429f-844a-c7980d5f47c9}"
export HOST=127.0.0.1
export ROOM_JUNE_URL="${ROOM_JUNE_URL:-http://127.0.0.1:8788}"
export ROOM_HARPER_URL="${ROOM_HARPER_URL:-http://127.0.0.1:8789}"
: "${CONDUCTOR_DATABASE_URL:?set it in .env (room_conductor)}"
: "${ROOM_SEAT_TOKEN:?set it in .env (you generate this)}"

# 5. Start. pm2 if present, else a bash supervisor.
if command -v pm2 >/dev/null 2>&1; then
  pm2 start "$APP/ecosystem.config.cjs" --update-env
  pm2 save
  echo "Up under pm2. For boot survival: run 'pm2 startup' once and follow its printed command."
else
  echo "pm2 not found — using a bash supervisor. Logs in $APP/logs/. Ctrl-C stops all."
  mkdir -p "$APP/logs"
  supervise() { # name script   (PORT may be set as an env prefix on the call)
    local name="$1" script="$2"
    while true; do
      echo "[$(date -u +%FT%TZ)] start $name" >>"$APP/logs/$name.log"
      node "$APP/$script" >>"$APP/logs/$name.log" 2>&1 || true
      echo "[$(date -u +%FT%TZ)] $name exited; restart in 3s" >>"$APP/logs/$name.log"
      sleep 3
    done
  }
  PORT=8788 supervise room-june   seats/june-route.mjs &
  PORT=8789 supervise room-harper seats/harper-route.mjs &
  supervise room-conductor conductor/main.mjs &
  trap 'kill 0' INT TERM
  wait
fi
