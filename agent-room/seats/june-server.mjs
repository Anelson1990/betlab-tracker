// Agent Room — June's route server (hardened per Harper's review).
//
// A tiny node:http service the conductor's webhookAdapter POSTs to. It requires a
// shared-secret header (x-room-token) and binds to localhost by default, so it is
// not an open unauthenticated endpoint. `makeServer` is exported for tests; the
// process only listens when run directly. NOT run from the cloud seat.
//
// Env (deploy): ROOM_SEAT_TOKEN (shared secret — set it or the server refuses
// everything), HOST (default 127.0.0.1), PORT (default 8788). June's model
// credential lives in env and is read inside generate() — never in this file.

import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { makeJuneHandler } from "./june-route.mjs";

const MAX_BODY_BYTES = 1_000_000;

function timingSafeEq(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function makeServer({ generate, token }) {
  const handle = makeJuneHandler({ generate });
  return http.createServer((req, res) => {
    if (req.method !== "POST") { res.writeHead(405); return res.end(); }
    // Fail closed: no configured token, or a mismatch, is rejected.
    if (!token || !timingSafeEq(req.headers["x-room-token"], token)) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end('{"error":"unauthorized"}');
    }
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > MAX_BODY_BYTES) req.destroy(); });
    req.on("end", async () => {
      let payload;
      try { payload = JSON.parse(raw || "{}"); }
      catch (e) { res.writeHead(400, { "content-type": "application/json" }); return res.end('{"error":"bad json"}'); }
      try {
        const turn = await handle(payload);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(turn)); // null = not ready
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end('{"error":"internal"}'); // generic — never leak env/key details
      }
    });
  });
}

// TODO(deploy): wire June's real model. Read the key from env; return the model's
// text (JSON turn preferred). guardJuneTurn enforces the safety floor regardless.
// Return null to mean "not ready".
async function generate(/* prompt */) { return null; }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const HOST = process.env.HOST || "127.0.0.1";
  const PORT = Number(process.env.PORT || 8788);
  const token = process.env.ROOM_SEAT_TOKEN || "";
  if (!token) console.error("WARNING: ROOM_SEAT_TOKEN not set — the server will refuse every request.");
  makeServer({ generate, token }).listen(PORT, HOST, () => console.log(`June route on ${HOST}:${PORT}`));
}
