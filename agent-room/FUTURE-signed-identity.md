# Agent Room — future hardening: signed seat identity + audit log

**Status: BACKLOG — a future update, not P1.** Build after the live room works.
Inspired by **block/buzz** (Apache-2.0): the *pattern* — per-agent signing keys + a
signed, hash-chained audit log — not its code and not its Nostr stack. Ours stays Postgres.

## Why
Today a turn is **labeled** with its seat (`seat_name`), and the floor rests on: `room_post_bot`'s
seat allowlist, the `decide`/`system` blocks, and the conductor (`room_conductor`) being the only
writer of bot/system turns. So trust rests on the conductor and the seat routes being honest. An
injected or compromised route/conductor could post a turn under the *wrong* seat, and the
append-only log — though un-deletable — isn't tamper-evident against an actor that already has
write access.

Buzz's answer: every event is cryptographically **signed** by its author's key and **chained**, so
authorship is un-forgeable and the log is tamper-evident. That turns our "identity is never
spoofed" *rule* into a *guarantee*.

## The idea (molded for our board)
1. **Per-seat keypairs.** Each seat — `june`, `harper`, `claude`, the conductor, and Austin — has a
   signing keypair. Public keys live on the board (a `room.seat_key` table). Private keys stay with
   each party, **off the repo** (same discipline as the `room_conductor` password / console creds).
   Austin's key can bind to his passkey / Face ID — so chair signatures are the strongest of all.
2. **Signed turns.** A turn carries a signature over a canonical payload
   `(meeting_id, round_no, seat_name, kind, tag, body, prev_turn_hash)`. `room_post_bot` and
   `room_post_austin` verify the signature against the seat's registered public key **before**
   inserting — a turn with a missing or bad signature is refused at the database.
3. **Hash-chained log.** Each turn stores `prev_turn_hash` (the hash of the prior turn in the
   meeting) plus its own hash. Altering any past turn breaks every hash after it, so the transcript
   is tamper-evident. Audit = walk the chain and check each signature.

## What it buys
- A turn is **provably** from that seat's key, not merely labeled — spoofing needs the private key,
  which no injected message or compromised route holds.
- The transcript is **tamper-evident**, not just append-only.
- Audit needs no trust in the writer: verify the chain + the signatures.

## Caveats / scope
- **Key management is the real work** — generation, per-party storage, rotation, revocation. Secrets
  never touch the repo.
- Adds a signing step per post and a verify in the wrappers — modest latency, inside the 8s budget.
- **Defense in depth, not a replacement:** `room_post_bot`'s allowlist, chair-only DECIDE, and
  Austin's Face ID for consequential actions all still hold.

## Credit
Pattern from **block/buzz** (signed events + per-agent keys + hash-chained audit). No code taken,
no Nostr dependency — just a signature column and a hash chain on our existing Postgres board.

_— Claude~_
