---
name: skill-library
description: Router into ECC components that were trimmed out of daily loading for this repo (betlab-tracker — a JS/React/Vite single-page app with no backend, database, or test framework). Use when a task needs an off-stack skill, agent, command, or rule set (a different language, a backend/database pattern, ECC meta-tooling, orchestration, etc.) that isn't in the always-loaded DAILY set.
metadata:
  origin: agent-sort
---

# ECC Skill Library (betlab-tracker)

This repo runs `agent-sort` to keep only repo-matched ECC surfaces loaded by
default. Everything else was moved here, under `.claude/library/`, where it
stays fully readable and grep-able but is not enumerated to Claude every
turn.

## DAILY (stays loaded)

- **Skills** (`.claude/skills/`): `react-patterns`, `react-performance`,
  `error-handling`, `git-workflow`, `vite-patterns`
- **Agents** (`.claude/agents/`): `code-reviewer`, `react-reviewer`,
  `react-build-resolver`, `security-reviewer`
- **Commands** (`.claude/commands/`): `code-review`, `react-build`,
  `react-review`, `security-scan`, `refactor-clean`, `checkpoint`,
  `save-session`, `resume-session`, `build-fix`
- **Rules** (`.claude/rules/ecc/`): `common/`, `react/`, `web/`

Evidence: `package.json` is a plain React 18 + Vite 5 SPA (JSX, no
TypeScript), no test framework, no lint config, no backend/database code.
`src/driveSync.js` and `src/sportApi.js` do OAuth token handling and
external `fetch()` calls, which is why `security-reviewer` and
`error-handling` are DAILY despite the app having no server of its own.

## LIBRARY (moved to `.claude/library/`, load on demand)

Read a file directly, or `grep -r` across the relevant subtree — nothing
here needs reinstalling to use it.

**Other languages/frameworks** (`library/skills/`, `library/agents/`,
`library/rules/`) — not present in this repo: `angular`, `arkts`, `cpp`,
`csharp`, `dart`/`flutter`, `fsharp`, `golang`, `java`/`spring`/`quarkus`,
`kotlin`, `laravel`, `nuxt`, `perl`, `php`, `python`/`django`/`fastapi`,
`react-native`, `ruby`, `rust`, `swift`, `typescript`, `vue`.

**Backend/database patterns** — no server or DB in this repo:
`backend-patterns`, `nestjs-patterns`, `api-design`, `database-migrations`,
`postgres-patterns`, `mysql-patterns`, `redis-patterns`,
`prisma-patterns`, `jpa-patterns`, `clickhouse-io`,
agent `database-reviewer`.

**Not-yet-adopted frontend surfaces** — no `framer-motion`/`motion` dep, no
aria/role usage, no Playwright: `motion-foundations`, `motion-patterns`,
`motion-advanced`, `motion-ui`, `frontend-a11y`, `accessibility`,
`e2e-testing`, `ai-regression-testing`, `react-testing`, `frontend-patterns`
(overlaps `react-patterns`/`react-performance` and covers Next.js, which
this app doesn't use).

**ECC meta/operator tooling** — manage ECC itself, not this app's code:
`ecc-guide`, `ecc-recipes`, `configure-ecc`, `agent-sort`, `skill-scout`,
`skill-stocktake`, `config-gc`, `context-budget`, `rules-distill`,
`repo-scan`, `ck`, `continuous-learning-v2`, `growth-log`,
`agent-self-evaluation`, `harness-audit`, `harness-optimizer`.

**Orchestration/multi-agent/PM workflows** — solo personal project, no
epics or multi-agent runs: `dmux-workflows`, `gan-build`/`gan-design` +
agents `gan-planner`/`gan-generator`/`gan-evaluator`, all `epic-*`,
`multi-*`, `orch-*`, `prp-*` commands, `jira`, `pm2`, `marketing-agent`,
`marketing-campaign`, `seo-specialist`, `chief-of-staff`,
`network-architect`/`network-config-reviewer`/`network-troubleshooter`/
`homelab-architect`, `opensource-forker`/`opensource-packager`/
`opensource-sanitizer`.

**Everything else off-stack**: any remaining skill/agent/command not in the
DAILY list above and not fitting a bucket here — check
`.claude/library/skills/`, `.claude/library/agents/`,
`.claude/library/commands/`, `.claude/library/rules/` directly; names are
unchanged from the original ECC install.

## Not installed at all

`.claude/hooks/`, `.claude/scripts/`, `.claude/mcp-configs/` were left as
the installer wrote them (not moved, not activated). `.claude/settings.json`
has no `hooks` key, so none of this executes automatically. Re-run the ECC
installer's `hooks-runtime` module deliberately if you want that wired up.

## Re-promoting a LIBRARY item to DAILY

`git mv .claude/library/<kind>/<name> .claude/<kind>/<name>` (drop the
`.md` extension handling for directories vs files as needed), then update
this file's DAILY list and the corresponding section above.
