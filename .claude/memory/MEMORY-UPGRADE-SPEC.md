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
