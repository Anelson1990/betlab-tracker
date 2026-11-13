// Tests for the shared seat-route factory. Run: node agent-room/seats/seat-route.test.mjs
import { buildSeatPrompt, guardSeatTurn, makeSeatHandler, makeSeatServer } from "./seat-route.mjs";

let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n + "\n       got:  " + a + "\n       want: " + b); } };
const ok = (n, c) => eq(n, !!c, true);

const P = "PROTOCOL-LINE";
const ctx = { seat: "harper", meeting: { title: "T", brief: "B", current_round: 1, budget_rounds: 10, wakes_used: 0, budget_wakes: 30 }, thread: [{ seat_name: "claude", kind: "propose", body: "built it", review_ready: true }] };

console.log("buildSeatPrompt");
ok("carries the protocol", buildSeatPrompt(P, ctx).includes(P));
ok("fences the meeting (nonce-tagged)", /MEETING:[0-9a-f]{8,} — untrusted/.test(buildSeatPrompt(P, ctx)));
ok("flags review-ready in transcript", buildSeatPrompt(P, ctx).includes("READY-FOR-REVIEW"));
ok("nonce differs per call (can't be forged)", buildSeatPrompt(P, ctx) !== buildSeatPrompt(P, ctx));

console.log("guardSeatTurn");
eq("decide -> propose", guardSeatTurn({ body: "x", kind: "decide" }).kind, "propose");
eq("body clamped to 8000", guardSeatTurn({ body: "a".repeat(9000) }).body.length, 8000);
eq("review_ready dropped by default", "reviewReady" in guardSeatTurn({ body: "x", review_ready: true }), false);
eq("review_ready kept when allowed", guardSeatTurn({ body: "x", review_ready: true, receipt: "r" }, { allowReviewReady: true }).reviewReady, true);
eq("receipt clamped to 500", guardSeatTurn({ body: "x", review_ready: true, receipt: "a".repeat(900) }, { allowReviewReady: true }).receipt.length, 500);
eq("allowedKinds narrows (working -> propose)", guardSeatTurn({ body: "x", kind: "working" }, { allowedKinds: ["review", "question", "ack", "propose"] }).kind, "propose");
eq("allowedKinds keeps review", guardSeatTurn({ body: "x", kind: "review" }, { allowedKinds: ["review", "propose"] }).kind, "review");

(async () => {
  console.log("makeSeatHandler");
  const h = makeSeatHandler({ seat: "harper", protocol: P, generate: async () => '{"body":"reviewed, clean","kind":"review","tag":"continue"}' });
  eq("handler -> review turn", (await h({ seat: "harper", meeting: {}, thread: [] })).kind, "review");
  eq("refuses wrong seat", await h({ seat: "june" }), null);

  let gotSignal = null;
  const hung = makeSeatHandler({ seat: "x", protocol: P, timeoutMs: 40, generate: (p, { signal }) => { gotSignal = signal; return new Promise(() => {}); } });
  eq("hung generate -> null", await hung({ seat: "x" }), null);
  ok("AbortSignal passed to generate", gotSignal != null);
  ok("AbortSignal aborted on timeout", gotSignal && gotSignal.aborted);

  console.log("makeSeatServer auth");
  const TOKEN = "s3cr3t-token";
  const srv = makeSeatServer({ seat: "harper", protocol: P, generate: async () => '{"body":"ok","kind":"review"}', token: TOKEN });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const post = (hd) => fetch(url, { method: "POST", headers: { "content-type": "application/json", ...hd }, body: JSON.stringify({ seat: "harper", meeting: {}, thread: [] }) });
  eq("no token -> 401", (await post({})).status, 401);
  eq("wrong-length token -> 401", (await post({ "x-room-token": "x" })).status, 401);
  const g = await post({ "x-room-token": TOKEN });
  eq("good token -> 200", g.status, 200);
  eq("good token -> turn", (await g.json()).kind, "review");
  srv.close();

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
