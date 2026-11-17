# TOOLBOX — vetted external tools for the crew

Tools Claude has scouted **and vetted by reading the code** (not just the stars).
Status: **🟢 GREEN** (vetted, use it) · **🟡 YELLOW** (useful but a real caveat —
read it) · **⏸ PARKED** (no current need; here if it comes up). Vets are focused
reads, not full line-by-line audits — re-check the specific path before depending on
it. Install is always Austin's call; nothing here runs on crew data without the
stated guardrails.

## 🟢 claude-video (`/watch`) — give Claude the ability to watch video
- **What:** `bradautomates/claude-video` (MIT). A Claude Code plugin: downloads a
  video (yt-dlp — YouTube / Instagram / X / Vimeo / any yt-dlp site), extracts frames
  + a timestamped transcript, and hands the frames (as images) + transcript to Claude.
  Most tutorials explain in **audio**, so the transcript carries most of the value.
- **Use:** default is **LOCAL** (captions → local WhisperX) — no key, nothing leaves;
  use this for anything private. For true **motion** (gameplay, continuous movement),
  its built-in **Gemini** mode watches the whole video natively (cloud + a Google key —
  public videos only). Scope long videos with `--start/--end/--max-frames` (frames =
  tokens; long videos get expensive).
- **Vet (2026-11-17):** read the scripts — MIT, **no telemetry** (the only "track"
  refs are caption tracks), outbound hosts all purpose-clear (transcription APIs are
  opt-in by key; `setup.py` installs uv/PyTorch for the local path). **Caveat:** it
  installs a **SessionStart hook** (5s advisory setup-check, benign) — we already run
  our own SessionStart hook, so mind the stacking.
- **Home:** June (content/muse). Bonus: watch a tool's demo video directly instead of
  screenshotting it.
- **Already in hand:** you don't need to install it for the audio half — the **Descript**
  connection transcribes a video URL today, zero setup.

## 🟢 REA (`morluto/rea`) — reverse-engineer anything (AUTHORIZED use only)
- **What:** MIT, local-only MCP server bridging an agent to Ghidra / IDA / Hopper /
  Cutter / pwndbg / pwntools / mitmproxy for reverse engineering, malware analysis, CTFs.
- **Vet (2026-11-17):** exceptionally security-mature — careful installer (installs
  only its own npm pkg, approval-gated `rea setup`), capability-token-authenticated
  bridges, Ghidra ephemeral / IDA read-only, PGP-verified Hopper install, strong
  lawful-use disclaimer, no telemetry found.
- **Guardrails:** authorized targets only; isolated VM for hostile binaries; BYO
  licensed Ghidra/IDA/Hopper; the opt-in HTTP MCP transport is plaintext — keep it local.

## 🟡 CLI-Anything (`HKUDS/cli-anything`) — auto-build a CLI for any GUI app
- **What:** Apache-2.0. An agent methodology that generates a Click CLI harness for GUI
  apps (+ pre-built harnesses for Blender/OBS/GIMP/…). For the P4 "agent control
  surfaces" idea (next to PinchTab).
- **Caveat (why YELLOW):** the `cli-hub` installer **phones home by default** (PostHog)
  on every invocation and fingerprints the agent env (reads `/proc` parent cmdlines).
  Opt out with `CLI_HUB_NO_ANALYTICS=1`; use the generation command (not `cli-hub`);
  never point it at a sensitive repo. Generated harnesses are unverified until reviewed.

## ⏸ Free LLM API lists — PARKED
- `cheahjs/free-llm-api-resources` + `mnfst/awesome-free-llm-apis`. Not worth it for the
  crew: free tiers log/train on prompts (wrong for our data) and aren't premium models
  (wrong for Harper/June). Back pocket for throwaway bulk inference on **non-sensitive**
  data only.

_Maintained by Claude~ — add an entry only after reading the tool's code._
