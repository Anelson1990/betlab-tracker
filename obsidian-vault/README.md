# BetLab Obsidian Vault

This folder is an [Obsidian](https://obsidian.md) vault that mirrors `KNOWLEDGE.md` in a linked,
browsable form. It exists to make chat context easier to navigate and extend over time — one
flat 500-line file is hard to skim or link between related lessons; a vault of small notes with
`[[wikilinks]]` and tags is not.

## Opening it
In the Obsidian app: **Open folder as vault** → select `obsidian-vault/`. No plugins required.
(If you use the Dataview community plugin, `Home.md` will render its daily-log table live —
without it, the manual link list below still works fine.)

## Structure
- **`Home.md`** — entry point / map of content. Start here.
- **`Rules/`** — one note per rule topic (POTD, RFI, Sharp Money, Hit Props, Bullpen, SGP,
  Staking, etc.), split out from `KNOWLEDGE.md`'s sections.
- **`Daily/`** — one note per session/date with that day's lessons, linked back to whichever
  Rule notes it touched or updated.
- **`Templates/Daily Session.md`** — template for the next daily note.

## How this relates to `KNOWLEDGE.md`
`KNOWLEDGE.md` stays the source of truth Claude fetches automatically at the start of a session
(per the Morning Protocol in `Rules/Session Rules.md`). This vault is a **parallel, linked view**
of the same information for human browsing and for building richer chat context over time — it
is not auto-fetched.

## Keeping it in sync
When you'd normally do the "end of session push" (update `KNOWLEDGE.md` + push):
1. Copy the new dated lessons into a new `Daily/YYYY-MM-DD.md` note from the template.
2. Link that note to whichever `Rules/*.md` notes it updates or confirms (`[[POTD Rules]]`, etc.).
3. If a rule changed (not just a one-off lesson), edit the relevant `Rules/*.md` note directly
   so it stays current rather than letting the rule drift from the daily log.
4. Commit both `KNOWLEDGE.md` and the vault changes together.

## Tags
`#rule` `#critical` `#daily` `#potd` `#rfi` `#sharp-money` `#hit-props` `#bullpen` `#parlay`
`#staking` `#pitching` `#models` `#checklist` `#sources`
