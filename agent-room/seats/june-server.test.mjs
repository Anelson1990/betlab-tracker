// Tests for June's route server auth. Run: node agent-room/seats/june-server.test.mjs
import { makeServer } from "./june-server.mjs";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name + "\n       got:  " + g + "\n       want: " + w); }
};

const TOKEN = "s3cr3t-room-token";
const srv = makeServer({ generate: async () => '{"body":"hi from June","tag":"continue"}', token: TOKEN });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${srv.address().port}/`;
const post = (headers) => fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ seat: "june", meeting: {}, thread: [] }) });

console.log("june-server auth");
eq("no token -> 401", (await post({})).status, 401);
eq("bad token -> 401", (await post({ "x-room-token": "wrong" })).status, 401);
const good = await post({ "x-room-token": TOKEN });
eq("good token -> 200", good.status, 200);
eq("good token -> guarded turn", (await good.json()).body, "hi from June");
eq("GET -> 405", (await fetch(url, { method: "GET" })).status, 405);

// a server with no configured token refuses even a correct-looking request
const srv2 = makeServer({ generate: async () => "{}", token: "" });
await new Promise((r) => srv2.listen(0, "127.0.0.1", r));
const url2 = `http://127.0.0.1:${srv2.address().port}/`;
eq("no server token -> 401 (fail closed)", (await fetch(url2, { method: "POST", headers: { "x-room-token": "anything" }, body: "{}" })).status, 401);

srv.close(); srv2.close();
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
