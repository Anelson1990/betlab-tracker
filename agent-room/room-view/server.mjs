// Agent Room — room-view read server (DRAFT, deploy-time).
//
// Serves the room-view page and GET /room-state.json by calling the read
// wrappers as room_app (read-only: EXECUTE on meeting_state + thread_read only;
// no conductor functions, no writes). Framework-free (node:http + pg) so it
// deploys anywhere. The page fetches ./room-state.json on its own origin.
//
// NOT run from the cloud seat (needs room_app creds). `node --check` only.
// Env: ROOM_APP_DATABASE_URL (session pooler, user room_app.<ref>, sslmode=require),
//      MEETING_ID (the active meeting), PORT (default 8787), THREAD_LIMIT (default 200).

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const MEETING_ID = process.env.MEETING_ID;
const LIMIT = Number(process.env.THREAD_LIMIT || 200);
const pool = new pg.Pool({ connectionString: process.env.ROOM_APP_DATABASE_URL, max: 5, statement_timeout: 8000 });

// index.html is authored as artifact content (no doctype/head/body); wrap it in
// the same minimal skeleton the artifact runtime adds, so it serves standalone.
const HEAD = '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}' +
  'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

async function roomState() {
  if (!MEETING_ID) throw new Error("MEETING_ID not set");
  const st = await pool.query("select public.room_meeting_state($1) as r", [MEETING_ID]);
  const th = await pool.query("select public.room_thread_read($1,$2) as r", [MEETING_ID, LIMIT]);
  const s = st.rows[0].r || {};
  return { meeting: s.meeting || null, seats: s.seats || [], thread: th.rows[0].r || [] };
}

const server = http.createServer(async (req, res) => {
  try {
    if ((req.url || "").split("?")[0] === "/room-state.json") {
      const body = JSON.stringify(await roomState());
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(body);
    }
    const content = await readFile(join(here, "index.html"), "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(HEAD + content + "</body></html>");
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end('{"error":"internal"}'); // generic — never leak env/key details
  }
});

server.listen(PORT, () => console.log(`room-view read server on :${PORT} (meeting ${MEETING_ID || "unset"})`));
