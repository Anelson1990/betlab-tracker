# Release-gate hook (DRAFT — not registered)

The **seat-local half** of the console's release gate, for any Claude Code seat
that holds exec/DB tools. A `PreToolUse` hook runs *outside the model*, so unlike
a CLAUDE.md rule it **cannot be talked past** by a clever argument or prompt
injection.

**Rule:** block a tool call that would *execute* a release-shaped action
(`bridge_release_job` / `console_release` / `_bridge_release_core`) unless a fresh
**console authorization token file** exists — i.e. unless Austin's Face ID tap just
opened a release window. Everything else passes untouched.

## Files
- `release-gate.py` — the hook logic.
- `release-gate.test.sh` — 5 cases (exec+release blocks; fresh token allows; benign allows; a file edit that merely *mentions* the function allows; execute_sql blocks). Run: `bash .claude/hooks/release-gate.test.sh`.

## Config (env)
- `CLAUDE_RELEASE_TOKEN_FILE` — path the console writes on an authorized release (default `~/.claude/.release-authorized`).
- `CLAUDE_RELEASE_FRESH_SECONDS` — how long the window stays open (default 120).

## How it fits the console
The console (on Austin's Face ID tap) is what would *touch* the token file — writing
it opens a short window; the hook then permits exactly the release calls during it.
No token, no release — even if the seat is injected or compromised. The Supabase
gate (token + name-the-job + rate limit) and the passkey remain the authority; this
just stops a local seat from *attempting* a release unauthorized.

## Before activation (review items — why it's a DRAFT, not wired)
- **Not registered in `settings.json` on purpose** — activating it now could block
  legitimate P1 DB work mid-build. Wire it only after Harper reviews + Austin okays.
- **Curate the pattern + exec-tool list** to the real release surface, to avoid
  false positives (it already scopes to exec tools so editing a *doc* that mentions
  `console_release` is allowed).
- **Verify the block signal** — this emits the newer `permissionDecision:"deny"`
  JSON plus `exit 2`; confirm the exact field against the installed version's hooks
  docs before relying on it.
- **Decide the fail-mode** — on an unparsable payload it currently *allows* (so a
  glitch doesn't freeze all work); for a stricter posture, fail closed.

_— Claude~_
