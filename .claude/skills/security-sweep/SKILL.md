---
name: security-sweep
description: Run a decomposed, parallel security review of OUR OWN code — scope and map entry points, trace reachable flows, generate per-category vulnerability hypotheses (access-control, injection, secrets-state, privilege/SSRF, gate-bypass), investigate in parallel, then dedupe, severity-rank, and VERIFY each finding against the source. Use for a real security pass on a repo or a risky change (new RPC, role grant, release-path edit, migration). Authorized targets only — our repos or explicitly authorized ones. NOT a licence to scan third-party systems, and NOT a substitute for reading the code: every finding is a hypothesis until confirmed at an exact line.
---

# Security Sweep

A structured way to run a *real* security pass instead of a vibes-based skim. The method — decompose the repo into scoped missions, generate hypotheses per category, investigate in parallel, then consolidate — is lifted (as a *method*, no code) from Open-Kritt's framing. It runs on our own `tiered-workers` and `multi-reviewer-patterns`, with `ai-slop-review` as the reviewer lens.

## The authorization floor (read first)
- **Our repos, or targets we're explicitly authorized to test. Nothing else.** "Find real vulnerabilities" pointed at your own code is defense; pointed anywhere else it's an attack. This skill is for the former, full stop.
- **Never hand our keys, `CONSOLE_DATABASE_URL`, or repo credentials to an unvetted third-party orchestrator.** Study their method; don't feed them our secrets.
- **Dual-use honesty:** if a sweep turns up something exploitable, it's reported to Austin to fix — never weaponized, never tested against a live third party.

## The sweep
1. **Scope & map entry points.** List how input/control *enters* the system: public RPC wrappers, HTTP/edge functions, the release path, `net.*` outbound calls, ntfy payloads, anything a client or an injected bot message can reach. Define what's in scope for this pass.
2. **Trace reachable flows.** For each entry point, follow where it goes — which SECURITY DEFINER function, which table, which role executes it, what it can touch. Untrusted input + a privileged sink = where to look hardest.
3. **Generate hypotheses, by category** (tuned to our surface):
   - **Access-control / authz:** RLS gaps, over-broad `GRANT`s, a `SECURITY DEFINER` that skips an ownership check, least-priv roles (`console_app` / `room_app`) holding more than they need, DECIDE/chair gate bypass.
   - **Injection / input-handling:** dynamic SQL, unparameterized RPC args, release-shaped inputs, anything built from a bot-supplied string.
   - **Secrets-state:** tokens in env/files/logs, service keys we believe are removed (*verify* — don't assume), GUC (`bridge.release_ok`) leakage or spoofing, connection strings in error output.
   - **Privilege / SSRF:** `pg_net` / `net.*` reachability (the known `PUBLIC`-on-`net.*` residual — confirm its blast radius), privilege escalation paths.
   - **Gate-bypass:** can a release fire without Austin's Face ID? Is the old token path truly closed? Is the 3/hour rate-limit intact? Can an injected proposal reach a consequential action?
4. **Investigate in parallel.** Hand scoped missions to workers (`tiered-workers`): cheap models map/enumerate; **security-critical reasoning stays on the strong model.** Assign file/area ownership so workers don't collide.
5. **Consolidate.** Dedupe, severity-rank, and **verify every surviving finding against the exact line** before it counts. Calibrate severity with `multi-reviewer-patterns`.

## Hard rules
- **A finding is a hypothesis until you point to the line.** No "probably exploitable." Show the code path or drop it. (Truth over alarm — a confident false positive wastes Austin's trust.)
- **Never auto-fix security.** Propose; Austin reviews. A security "fix" can open a worse hole.
- **Production is read-only during a sweep.** Reproduce on sandbox, never probe jessica-core live.
- **Keep the safety floor.** The sweep finds problems; it never fires a consequential action to "prove" one.

## Fits with
`tiered-workers` (parallel scoped missions), `multi-reviewer-patterns` (dedupe + severity), `ai-slop-review` (the reviewer's eye), and our real surface — the Supabase gate, RLS, least-priv roles, the release path, `net.*`.

_— Claude~_
