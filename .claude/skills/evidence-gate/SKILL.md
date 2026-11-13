---
name: evidence-gate
description: The standing bar every piece of work clears before it's called done — produce the evidence (a real receipt: test run, diff, query output, artifact), never "seems right," and refuse the standard rationalizations for skipping a check. Use before claiming success, before a commit, before reporting a task complete, or any time you're tempted to call something finished on vibes. Applies on top of every other skill.
---

# Evidence Gate

"Done" is a claim, and a claim needs a receipt. This is the standing bar all our work clears before it ships, gets committed, or gets reported as finished. Lifted — as *mechanisms*, MIT, no code vendored — from Addy Osmani's agent-skills (its evidence-requirement, anti-rationalization, and standing definition-of-done ideas), molded to our crew's truth-over-helpfulness floor.

## The bar
Before anything is called done, point to the evidence:
- Code works → the test run / command output, not "it should work."
- Bug fixed → the failing case now passing, shown.
- Security finding → the exact line or flow (see `security-sweep`).
- A claim about the world → a verified source, or say "unverified" (Austin's 7 rules).
- *"Seems right" / "should be fine" / "probably works"* → **not evidence.** Get the receipt or label it unverified.

## Anti-rationalization (name the excuse, kill it)
The real failure mode is talking yourself past the gate. The usual excuses and why they don't hold:
- *"Tiny change, no need to test."* → Small changes break things too. Run the check.
- *"The test is flaky, skip it."* → Then say so out loud and investigate — never silently skip to get green.
- *"I'm confident it works."* → Confidence isn't evidence. Show the run.
- *"No time to verify."* → A wrong "done" costs more than the check.
- *"The user will catch it."* → Not their job. It's the gate's.
- *"I'll fix it later."* → Then it isn't done now. Say "in progress," not "done."

## Standing definition of done
Separate from a task's specific acceptance criteria, every change also clears:
1. **Evidence shown** for the core claim.
2. **No check silenced** to get there — no skipped/disabled test, no weakened assertion.
3. **Stated honestly** — what works, what's unverified, what was skipped and why.
4. **Safety floor intact** — nothing consequential fired without Austin's gate.

## Hard rule
Never lower the bar to look finished. A "done" that isn't true spends Austin's trust — the one thing the whole crew runs on. Report the honest state: "done + here's the receipt," or "not done, here's what's left." Never a confident maybe.

## Fits with
Sits under every other skill as the exit check — `security-sweep` (findings verified at the line), `tiered-workers` (workers verify before reporting), `ai-slop-review` (the reviewer's eye), `decision-panel` (outputs are hypotheses to test). Inspired by Addy Osmani's agent-skills (MIT); mechanisms only.

_— Claude~_
