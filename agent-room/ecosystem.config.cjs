// Agent Room — pm2 process config for an always-on Linux box.
// Started by run-box.sh (which sources .env first, so these processes inherit
// the secrets). Seats bind localhost only; the conductor reaches them via
// ROOM_JUNE_URL / ROOM_HARPER_URL from .env. Nothing goes live off a room turn.
//
//   cd agent-room && pm2 start ecosystem.config.cjs && pm2 save
//   (for boot survival, run `pm2 startup` once and follow its printed command)

module.exports = {
  apps: [
    { name: "room-june",      script: "seats/june-route.mjs",   cwd: __dirname, env: { HOST: "127.0.0.1", PORT: "8788" }, time: true },
    { name: "room-harper",    script: "seats/harper-route.mjs", cwd: __dirname, env: { HOST: "127.0.0.1", PORT: "8789" }, time: true },
    { name: "room-conductor", script: "conductor/main.mjs",     cwd: __dirname, time: true },
  ],
};
