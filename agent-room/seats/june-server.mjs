// Agent Room — June's route server (DRAFT, deploy-time).
//
// A tiny node:http service the conductor's webhookAdapter(ROOM_JUNE_URL) POSTs to.
// It frames the room context for June, calls her model (injected `generate`), and
// returns a guarded TURN. NOT run from the cloud seat (needs June's model key in
// env, which stays off the repo). `node --check` only.
//
// Env: PORT (default 8788). June's model credential lives in env at deploy and is
// read inside generate() — never in this file or the repo.

import http from "node:http";
import { makeJuneHandler } from "./june-route.mjs";

const PORT = Number(process.env.PORT || 8788);

// TODO(deploy): wire June's real model here (Muse AI, or an LLM carrying June's
// voice). Read the key from env. Return the model's text (JSON turn preferred);
// guardJuneTurn normalizes and enforces the safety floor regardless. Return null
// to mean "not ready" (June holds; her stick times out cleanly).
async function generate(/* prompt */) {
  return null;
}

const handle = makeJuneHandler({ generate });

const server = http.createServer((req, res) => {
  if (req.method !== "POST") { res.writeHead(405); return res.end(); }
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
  req.on("end", async () => {
    let payload = {};
    try { payload = JSON.parse(raw || "{}"); } catch (e) { res.writeHead(400); return res.end('{"error":"bad json"}'); }
    try {
      const turn = await handle(payload);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(turn)); // null = not ready
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  });
});

server.listen(PORT, () => console.log(`June route on :${PORT}`));
