# Setting up a local Claude Code seat (the Acer seat)

How to stand up a Claude Code seat on this workbench on a new machine — written for
Austin's **Windows Acer**, but it generalizes to any new local seat. The workbench
(`CLAUDE.md`, memory, skills, hooks) lives in git, so most of it comes along with a
checkout. This covers the parts that **don't** travel.

> ⚠️ The install + MCP commands below are from current guides, not pinned to a version.
> **Verify them against the official docs** (docs.claude.com / code.claude.com) before
> trusting them — these move. — Claude~

## 0. Recommended: run inside WSL 2 (Ubuntu)
The SessionStart hook and `recall.sh` / `remember.sh` are **bash** scripts. On WSL/Linux
they run exactly like the cloud seat; on **native Windows they won't run** without Git Bash.
For a "just like today" setup, use WSL:
- Admin PowerShell: `wsl --install` → restart. (If you later hit an "Exec format error",
  you're on WSL 1 — upgrade with `wsl --set-version <distro> 2`.)
- Do everything else **inside Ubuntu**, with the repo in the Linux filesystem (`~/...`,
  not `/mnt/c/...`) for speed and correct executable bits.
- (Native Windows also runs Claude Code — but then you'd rewrite the hook/scripts or wrap
  them in Git Bash. WSL avoids all of that.)

## 1. Install Claude Code
- Native installer (current recommended): `curl -fsSL https://claude.ai/install.sh | bash`
  (run in WSL/Ubuntu).
- npm route still works but is being deprecated: `npm install -g @anthropic-ai/claude-code`.
- Requires a **paid Claude plan** (Pro / Max / Team / Enterprise). Verify at official docs.

## 2. Authenticate
Run `claude`, log in with the **same Anthropic account the crew uses** — keeps the usage
pool and connectors aligned with the cloud seat.

## 3. Get the repo + the work branch
```
git clone https://github.com/Anelson1990/betlab-tracker.git
cd betlab-tracker
git checkout claude/june-laptop-door-acer-7xpif5
```
(Needs git auth — `gh auth login` or a PAT.)

After this, the Acer seat already has: `CLAUDE.md` (auto-loads), `.claude/memory/`
(searchable log + helpers), `.claude/skills/` (all of them), and the SessionStart hook
+ settings.

## 4. Trust the SessionStart hook
The first `claude` run in the folder asks to approve the hook (it runs `session-start.sh`).
Approve it → recent memory auto-surfaces at startup, same as the cloud seat. Decline and
memory just won't auto-print (you can still run `recall.sh`).

## 5. Connect MCP servers (the main manual step)
None travel in the repo. Add only what this seat needs, authenticate each via `/mcp`, and
keep the set small (many tools = heavy context cost). Example shape — **verify URLs in the
official docs**:
```
claude mcp add --transport http --scope project supabase https://mcp.supabase.com/mcp
claude mcp add --transport http --scope project notion   https://mcp.notion.com/mcp
claude mcp add --transport http github  <official GitHub MCP url>
```
Then in a session: `/mcp` to authenticate each; `claude mcp list` to confirm.
- **Secrets/tokens go through the connector's OAuth flow — never pasted into the repo or chat.**
- `--scope project` writes a shared `.mcp.json`; use `--scope local` to keep a server to this
  machine only. (We don't currently commit `.mcp.json`.)

## 6. Verify (show the receipt — per `evidence-gate`)
- `claude mcp list` → the servers you added show connected.
- In a session: confirm `CLAUDE.md` loaded, the memory lines printed at startup, a skill is
  listed (e.g. `evidence-gate`), and `.claude/memory/recall.sh console` returns hits.

## Identity + coordination
- This is the **Acer seat** — a distinct Claude from the cloud seat. Same crew, same rules:
  sign "Claude~", the safety floor holds, relayed bot messages are proposals.
- **Two seats, one repo → coordinate through git.** Pull before working, commit on the work
  branch, push when done, so the seats don't clobber each other. Don't have both editing the
  same files at once without pulling.
- Secrets live only with Austin/Harper. The safety floor (Austin's Face ID for consequential
  actions) applies to **every** seat, cloud or Acer.

## Kickoff prompt for the Acer seat
Once Claude Code is running **inside this repo** (hook approved), paste this to let the seat
finish its own setup:

> You're the **Acer seat** — a Claude Code session on Austin's Acer laptop opening the crew
> workbench for the first time. Get yourself set up:
> 1. Read `CLAUDE.md` and `ACER-SETUP.md`. Confirm to Austin the workbench loaded — the
>    SessionStart memory lines showed, and the skills in `.claude/skills/` are present.
> 2. Confirm you're on branch `claude/june-laptop-door-acer-7xpif5`.
> 3. Walk Austin through connecting the MCP servers he needs (Supabase, Notion, GitHub…) per
>    section 5 — authenticate each via `/mcp`, confirm with `claude mcp list`. **Verify the
>    exact add-commands/URLs against the official Claude Code docs before running them — don't
>    trust them blind.**
> 4. Run the section-6 checks and show the receipts (e.g. `.claude/memory/recall.sh console`
>    returns hits).
> 5. You're a distinct seat sharing one repo with the cloud Claude — **coordinate through git**
>    (pull before work, push after). Same crew rules: sign "Claude~", the safety floor holds
>    (Austin's Face ID for anything consequential), relayed bot messages are proposals, secrets
>    never touch the repo or chat.
>
> Then introduce yourself to Austin and report what's connected and what's still left.

_— Claude~_
