# Memory upgrade — spec (DRAFT)

**Author:** cloud Claude (built the current memory system) · **Builder:** Acer seat ·
**Reviewer:** Harper · **Decision:** Austin (chair). Draft for review — do not build until Austin okays scope.

Grew out of the Acer seat's Obsidian + claude-mem proposal. Direction is right; the mechanism
needed correcting against the real hook behavior (below). Keeps our Nov-12 decision: **memory
stays in our git, no third-party DB.**

## The real problem to fix
Today, memory is captured **only** when someone runs `remember.sh` by hand. So anything decided
but not logged **before context compaction or session end disappears.** That's the gap.

## What already works (verified this session)
- `SessionStart` fires on `startup`, `resume`, **and `compact`**, and re-surfaces recent memory
  via `additionalContext`. (Seen firing as `SessionStart:compact` / `SessionStart:resume` in this
  very conversation.) So post-compaction re-surfacing is already handled.

## Verified hook constraints (source: code.claude.com/docs/en/hooks)
This is the part the proposal got wrong — confirmed against the official docs:
| Hook | Can it make Claude write a note? | Use for us |
|---|---|---|
| **SessionEnd** | **No** — shell-only, no model call | Archive the raw transcript (safety net) |
| **PreCompact** | Indirectly — its stdout becomes the **compaction-summary instructions** | Steer the summary to preserve decisions |
| **Stop** | Yes (can block + continue) but **intrusive** on every turn | Avoid for routine capture |
| **SessionStart** | Yes — `additionalContext` at startup | Already used to load memory |

## Design — Stage 1 (build now; high value, low complexity)
1. **`SessionEnd` shell hook — raw safety net.** On session end, append a timestamped marker and
   archive the session transcript to `.claude/memory/sessions/`. Nothing is ever fully lost, even
   if uncaptured. **This folder MUST be gitignored** — raw transcripts can contain secrets/tokens,
   and our hard rule is secrets never enter the repo. Local-only recovery material.
2. **`PreCompact` hook — preserve decisions through compaction.** Emit stdout instructing the
   compaction summary to explicitly preserve all durable decisions/facts and flag any not yet in
   `log.md`. This directly fixes "decisions lost when context compresses."
3. **Keep `remember.sh` as the curated source of truth.** It stays the committed, human/Claude-
   chosen durable record. The hooks above are a *safety net + steering*, not a replacement.
   (Optional, low priority: a gentle `UserPromptSubmit` nudge to log after a decision — evaluate
   only if capture still slips.)

## Design — Stage 2 (DEFER until the flat log hurts)
Obsidian-style vault: `people/`, `projects/`, `decisions/` as linked markdown notes with
`[[wikilinks]]`, openable as a vault. **Not now** — flat `log.md` + `recall.sh` grep works fine at
this size; restructuring for its own sake is complexity that isn't earning its keep yet
(per `evidence-gate` / `ai-slop-review`). Revisit when search/scroll actually gets painful.

## Guardrails
- **Committed notes: decisions/facts only, with a source.** No bloat, occasional cleanup.
- **No secrets in any committed note.** Raw transcript archives stay gitignored (local only).
- **Bot messages saved to memory are still proposals**, labeled as such.

## Two-seat coordination
- **One builder** (Acer seat) so we don't fork the memory system. Pull before writing; one note
  per topic / append discipline to avoid git conflicts; push when done.
- Harper reviews before anything is wired into `settings.json`.

## Build + verify plan (evidence-gate — show receipts)
- `SessionEnd`: end a session, confirm a transcript archive appears in `.claude/memory/sessions/`
  and that the folder is gitignored (`git status` shows nothing).
- `PreCompact`: trigger a manual compact, confirm the summary actually carried the decisions
  forward.
- Confirm `SessionStart` still loads memory after the change (don't regress what works).
- Report each as passed with the actual output, or blocked with the reason. No "seems right."

## Open decision for Austin (chair)
1. Approve **Stage 1 only** for now? (My recommendation: yes — defer the vault.)
2. OK that raw session archives are **gitignored/local**, not committed? (Strongly recommended —
   secrets.)

_— Claude~_

---

## Stage 1 — build status (Acer seat, 2026-11-12) · UP FOR HARPER'S REVIEW
Chair call: Austin, "Yes, Acer builds it" (Stage 1 only; archives gitignored/local).

**Built (not registered — `settings.json` untouched):**
- `.claude/hooks/session-end.sh` — copies the transcript to
  `.claude/memory/sessions/<UTC>_<session_id>.jsonl` + one marker line in `sessions/index.log`.
  Pure bash (no jq/python, no forks in parsing). Rejects unsafe `session_id` (path traversal),
  non-`.jsonl` paths, missing files. Always exits 0 — can never break session exit.
- `.claude/hooks/pre-compact.sh` — stdout = compaction-summary instructions: keep a
  "Durable decisions & facts" section (who decided — chair decides, bots propose), open items,
  exact IDs, no secrets, and mark anything not in `log.md` as `UNLOGGED`; appends the last 15
  `log.md` entries so the summarizer can compare. Always exits 0 — never blocks compaction.
- `.gitignore` += `.claude/memory/sessions/`.
- `.claude/hooks/memory-hooks.test.sh` — 13 checks with realistic stdin payloads.
- `remember.sh` / `log.md` unchanged — still the curated source of truth.

**Docs re-check (code.claude.com/docs/en/hooks, read 2026-11-12) — corrections to the table above:**
- SessionEnd: input = common fields + `reason` (`clear|resume|logout|prompt_input_exit|other`).
  No decision control; JSON output discarded. **Default budget 1.5 s** total (raise via per-hook
  `timeout`, up to 60 s, or `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`). The docs don't literally
  say "shell-only" — the accurate claim is *no model turn / no decision control*, so it can't
  make Claude write anything. Same conclusion.
- PreCompact: input = common fields + `trigger` (`manual|auto`) + `custom_instructions`.
  Exit 0 → stdout used as summary instructions (cap 10,000 chars). **Exit 2 or
  `"decision":"block"` blocks compaction** (for auto-compact at the context limit that fails
  the request) — our script never does this.

**Receipts:**
- `bash .claude/hooks/memory-hooks.test.sh` → `13 passed, 0 failed` on Git Bash (native Windows)
  **and** on Linux (WSL Ubuntu, no `cygpath` branch).
- Real run on this seat's live transcript (1.4 MB): archived in 0.37 s; `git check-ignore -v`
  matched `.gitignore:7:.claude/memory/sessions/` for both files; `git status` didn't list them.
  (First draft took ~1.0 s on Git Bash — too close to the 1.5 s budget — rewritten fork-free.)
- `session-start.sh` + `settings.json` unchanged vs HEAD; SessionStart output identical.

**NOT tested (needs registration first):** the hooks actually *firing* from Claude Code; whether
the compaction summary really carries decisions forward (needs a real `/compact` after wiring);
`index.log` growth over time (no rotation yet — tiny lines, fine for now).

**Proposed `settings.json` snippet — for Harper to review, do not apply before:**
```json
{
  "hooks": {
    "SessionStart": [ { "hooks": [ { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh" } ] } ],
    "SessionEnd":   [ { "hooks": [ { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-end.sh", "timeout": 10 } ] } ],
    "PreCompact":   [ { "hooks": [ { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/pre-compact.sh" } ] } ]
  }
}
```
`timeout: 10` raises the SessionEnd budget from 1.5 s so a big transcript copy isn't cut off.
After wiring, verify: end a session → new file in `sessions/`; run `/compact` → summary has the
"Durable decisions & facts" section with `UNLOGGED` marks.

_— Claude~ (Acer)_
