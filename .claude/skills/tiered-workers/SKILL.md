---
name: tiered-workers
description: Run a cost-tiered subagent crew — plan and verify on the strong model, farm separable grunt work to cheap-model workers under a check gate. Use when a task has 2–4 genuinely independent sub-jobs, when running a builder → independent-reviewer loop, or when you want to parallelize legwork without burning the usage pool. NOT for security-critical reasoning (keep that on the strong model), and NOT for inseparable work (parallelism there is just overhead).
---

# Tiered Workers

Spin up a small, cheap work crew: *you* (the strong model) plan, brief, and verify; cheap-model subagents do the separable legwork; each is gated by a check before it counts. It's the "expensive model thinks, cheap models do the work" pattern — applied with discipline, not theater.

## When it pays (and when it doesn't)
- **Use it** when the work splits into **2–4 genuinely independent** pieces (separate files/modules, parallel research threads, a build + an independent review), or for a builder → reviewer loop.
- **Don't** when the work is one tangled thing — parallelism there is coordination overhead and merge pain, not speed.
- **Never 16-for-the-camera.** Real separability caps most tasks at a handful of workers; more is theater.

## The loop
1. **Plan (you).** Decompose into independent jobs; give each worker a crisp brief + a clear definition-of-done. Assign file/area ownership so workers don't collide.
2. **Dispatch, tiered by job:**
   - **Cheap model (Haiku / Sonnet)** for mechanical, separable work — scaffolding, routine edits, running tests, focused research, boilerplate.
   - **Strong model (you / Opus-class)** for anything needing hard reasoning or **security-critical judgment** — gates, auth, SQL, release logic, money. Never hand those to a cheap worker.
   - Spawn in the background when you can keep working meanwhile.
3. **Check each (the gate).** A worker self-verifies — tests pass / self-review against its DoD — before reporting. Use a *separate* reviewer worker so no worker grades its own work (builder ≠ reviewer).
4. **Verify + merge (you).** Workers never self-merge. You integrate, diff genuine conflicts, and own the result. An unverified claim stays a claim until you confirm it against a receipt (a test run, a diff, an artifact).

## Hard rules
- **Same usage pool.** Subagents draw on the plan limits — tiering (cheap workers) is what keeps a crew *affordable*, not free. Keep the count small.
- **Safety floor holds.** No worker can fire a consequential action (release, a send under Austin's name, go-live); those gate to Austin's Face ID, same as always.
- **Workers are ephemeral.** They return a summary and vanish — capture anything durable in `.claude/memory/` or the board, never only in the worker.

## Fits with
The Agent Room's "Claude seat parallelizes internally" (the seat becomes a mini-team when a job's separable), the builder-reviewer loop, and the vendored `agent-teams` skills (file ownership, merge strategies).

_— Claude~_
