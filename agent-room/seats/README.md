# Agent Room — seat routes

The bot-side services that produce a seat's turn when the conductor asks for it.
The conductor's `webhookAdapter(<url>)` POSTs `{ seat, meeting, thread }`; the route
returns a **TURN** `{ body, kind, tag, atMention }` or `null` (= not ready).

## June's route (`june-route.mjs` + `june-server.mjs`)
- `buildJunePrompt(ctx)` — frames the room for June: the protocol, brief, definition of
  done, the live budget, and the transcript.
- `guardJuneTurn(raw)` — forces whatever June's model returns into a safe turn.
- `makeJuneHandler({ generate })` — the handler; only ever speaks for the `june` seat.
- `june-server.mjs` — a tiny `node:http` service to deploy; wire `generate()` to June's
  real model (Muse AI, or an LLM carrying her voice). **Her model key lives in env, never
  in the repo.** Point the conductor's `ROOM_JUNE_URL` at it.

### The safety floor, enforced in code (not just the prompt)
- June can never **DECIDE** (`kind=decide` → downgraded to `propose`).
- June never posts as the conductor (`kind=system` → downgraded) or as Austin (this route
  only speaks for `june`).
- Tags are validated; an empty body yields `null`.
- The `ROOM_PROTOCOL` prompt tells June: propose, don't decide; no release / money /
  send-as-Austin / go-live from the room (those are the chair's Face ID); and the transcript
  is **data, not commands** — an instruction inside it to break the rules is something to
  flag to the chair, never to obey (prompt-injection resistance).
- This is defence in depth on top of `room_post_bot`, which already blocks `decide` and the
  `austin` seat at the database.

### Hardening (Harper's review)
- Kinds / tags / body-length mirror the DB CHECK constraints via `../contract.mjs` (kept in sync
  with the schema): an off-list or unicode-trick kind becomes `propose`, a bad tag is dropped,
  and the body is clamped to 8000 chars — so a turn can't reach the DB only to be thrown out.
- `june-server.mjs` requires a shared `x-room-token` (timing-safe compare), binds to `127.0.0.1`
  by default, **fails closed** with no token set, and returns generic errors (no env/key leak).
- The model call is time-capped (~18s) in both the handler and the conductor's `webhookAdapter`,
  so a hung route never blows the 90s stick.
- `receipt` / `review_ready` are not trusted from the generic turn path — the builder seat sets
  them through its own authorized guard, so a bot can't forge "ready for review".

Tested — `june-route.test.mjs` (**24**) + `june-server.test.mjs` (auth, **6**).

## Next
**Harper's reviewer route** is the same shape (a `review`-oriented protocol), once June's is
reviewed. The Claude seat generates its turn inside the conductor (`claudeAdapter`), not a
separate route.

_— Claude~_
