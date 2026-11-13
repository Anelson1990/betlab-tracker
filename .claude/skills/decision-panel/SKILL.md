---
name: decision-panel
description: Convene a panel of simulated role-lenses (strategist, operator, finance, skeptic, adversary, customer) and an optional simulated audience to pressure-test a decision, plan, offer, or design BEFORE committing real resources. The panel's job is to surface disagreement and failure modes, not applause. Use for go/no-go calls, risky plans, pricing or offers, launch readiness, or a design review. NOT market validation and NOT real people — simulated reactions are a structured thinking aid, never evidence.
---

# Decision Panel

A structured pre-commit stress test: convene a few conflicting voices, make them argue, and surface the failure modes *before* you spend real time, money, or reputation. Molded from Founder Skill's "board of advisors + buyer panel" idea — the pattern, not the plugin, and nothing installed.

## The honest limit (read first — this is the whole trap)
**Simulated ≠ real.** A panel of personas is *you*, thinking in structured voices. "100 simulated customers liked it" is **not** customer validation — it's a brainstorm wearing costumes. Every output is a **hypothesis to go test against real people or real data**, never proof. The "test your business idea with AI" skills live or die on this line: use the panel to find what to *check*, never to decide you've checked it.

## How to run it
1. **Frame the decision crisply.** What's being decided, what's actually at stake, and *what would make this a mistake.* A vague prompt gets vague theater.
2. **Pick 3–6 lenses that genuinely conflict** — not a row of yes-men:
   - **Operator** — can we actually build/ship/run this, with what we have?
   - **Finance** — does the math survive contact? Where's the real cost/margin?
   - **Skeptic (pre-mortem)** — assume it already failed. Write the autopsy.
   - **Customer / audience** — would they actually pay / use / care, or just say nice things?
   - **Adversary** — how is this abused, attacked, or gamed? (my lane)
3. **Make them disagree.** Each voice gives its *strongest objection*, not a tidy summary. Kill consensus-manufacturing — if they all agree, you picked the lenses wrong.
4. **(Optional) simulated audience** — a handful of *distinct* personas reacting. Good for catching obvious objections; useless as a vote count. Never report "X of Y approved" as a number that means anything.
5. **Synthesize** — the real failure modes found, what's still genuinely unknown, and **the one thing to go verify with reality** before committing.

## Tier it
Cheap workers can voice individual lenses in parallel (`tiered-workers`); the strong model frames the question and does the synthesis — because judging which objection actually matters is the hard part.

## Hard rules
- **Surface dissent, not applause.** A panel that makes you feel good did nothing.
- **Never dress simulated reactions as real data or validation.** Say "simulated" every time.
- **The chair still decides.** A panel advises; Austin decides. It never converts a simulated vote into a go.
- **It's a pre-commit step, then go test the real thing.** The panel ends by pointing at reality, not replacing it.

## Fits with
`tiered-workers` (parallel lenses under one synthesizer). Distinct from the **Agent Room**: the Room is the *real* crew (June, Harper, me) taking turns with Austin deciding; this is *simulated* lenses one seat runs to think harder before bringing something to the real table. The Room's "Claude seat" can run a decision-panel internally — but that wiring waits for Harper's review of the P1 foundation.

_— Claude~_
