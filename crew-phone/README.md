# crew-phone — guardrailed phone control for the crew

A phone-control harness a seat (Claude / Harper) can use, built around **one idea
phone-harness doesn't have: a consequential-action gate.** Read and navigate run
freely; anything that spends money, sends on Austin's behalf, approves, installs,
or deletes is **refused at execution time** and turned into a proposal that needs
**Austin's Face-ID tap** (the Bridge Console floor).

Inspired by `phone-harness` (MIT) — its clean adb vocabulary (`screencap`,
`uiautomator dump`, `input tap/swipe/text`) — but **no code or dependency taken**,
and **no telemetry** (phone-harness ships PostHog telemetry; this doesn't). Android /
adb only for v0.

## Status (honest labels)
- **Guardrail core: BUILT + TESTED here** — classify → gate → audit, the adb command
  builders, and the session loop. `tests/test_core.py`: **30 passed**, including the
  security cases (agent can't forge an approval; consequential actions never execute
  without a chair-minted, action-bound token; fail-closed on unverified taps).
- **Live device control: NOT run from the cloud seat** — the cloud container can't
  reach a phone. It runs where adb can (June's box / Austin's machine, USB or
  Wireless debugging).
- **Console wiring: the next step** — the gate emits proposals and verifies
  chair-minted approvals; hooking the proposal → Face-ID tap → approval round-trip to
  the live Bridge Console (`bridge_jobs`) is deploy work, not done here.

## The gate (why it's safe)
- **Fail closed.** If the harness can't prove an action is safe, it's consequential.
  A bare-coordinate tap with no target verified from the UI tree is consequential —
  an agent can't sneak a "Buy" tap through as a raw `x,y`.
- **Unforgeable approval.** A consequential action is only promoted to run by
  `approval = HMAC(chair_key, action_fingerprint)`. The **chair key is held by the
  Console / chair side and injected into the harness runtime — the agent never has
  it.** So the agent can only *propose*; only Austin's Face-ID tap (which makes the
  Console mint the token) can let it run. An approval is bound to the exact action,
  so it can't be reused for another.
- **Default read-only.** `Policy.mode` starts `read_only` (only reads run). `assist`
  mode allows writes, but consequential ones still need the tap.
- **App scope.** Write ops only in allow-listed apps; acting inside a sensitive app
  (bank, messaging, settings, wallet, …) is always consequential.
- **Everything audited.** Every request, decision, proposal, and execution is a line
  in an append-only log.

## Shape
```
crew-phone/src/crewphone/
  policy.py    # modes, app allowlist, consequential-keyword + sensitive-app lists
  actions.py   # the Action model + classify()  (pure)
  gate.py      # decide() + HMAC approval binding  (pure)
  audit.py     # append-only JSONL log
  adb.py       # adb command builders (pure argv) + run()
  session.py   # request(action, approval) -> classify -> gate -> audit -> execute/propose
tests/test_core.py   # 30 tests, zero deps
```

## Use (on a box with adb to the phone)
```python
from crewphone import Policy, Gate, Audit, Session, Action
import os
gate = Gate(policy=Policy(mode="assist", app_allowlist=frozenset({"com.example.shop"})),
            chair_key=os.environ["CREWPHONE_CHAIR_KEY"].encode())  # chair-held; NOT the agent's
s = Session(serial="<adb-serial>", gate=gate, audit=Audit("crewphone.log"))

s.request(Action("read_screen"))                       # runs — safe
s.request(Action("tap", app="com.example.shop",
                 target_text="Buy now", target_verified=True))   # PROPOSAL — not run
# ...Austin taps Approve in the Console (Face ID) -> it mints the approval:
#   approval = gate.issue_approval(action)   (Console side; needs the chair key)
# s.request(same_action, approval=approval)  -> runs
```
Run the tests: `cd crew-phone && python3 tests/test_core.py`

## Hard floor (unchanged)
No release, money, send under Austin's name, or go-live without his Face-ID tap. The
agent proposes; only the chair decides. The `CREWPHONE_CHAIR_KEY` lives with the
chair/Console, never in the repo, never with the agent.

_Credit: adb approach from phone-harness (MIT). Built by Claude~_
