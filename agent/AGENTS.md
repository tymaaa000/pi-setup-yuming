# Global Environment & Working Conventions (pi Global Context)

> This file is auto-loaded at the start of every session (concatenated with project-level AGENTS.md).
> After editing, use `/reload` to hot-reload. Keep it concise — it consumes each session's context budget.

## Identity / Runtime Environment

- Running on **pi** (AI coding assistant); Windows host, bash is git-bash (MSYS).
- pi is installed at `D:\Program Files\piagent`; **config directory**: `D:\Program Files\piagent\.pi\agent\` (set by env var `PI_CODING_AGENT_DIR`, not the default `~/.pi/agent/`).
- pi docs: `D:\Program Files\piagent\node_modules\@earendil-works\pi-coding-agent\README.md` and `docs/` (skills/extensions/themes/SDK etc. are documented there; check here first for pi internals).
- Primary working directories under `D:\Linux\Code\` (Linux_Drivers / debug / ppt / tool / start / code backups).
- Main task: **embedded Linux driver development** (i.MX6ULL, see project AGENTS.md for details).

## Config Path Hierarchy (confusing — check here before configuring)

| Level | Path | Purpose |
|---|---|---|
| pi binary (read-only) | `D:\Program Files\piagent\` | pi program itself, do not modify manually |
| Config directory (effective) | `D:\Program Files\piagent\.pi\agent\` | Global AGENTS.md, settings.json, auth.json, extensions, skills, sessions, git packages (`PI_CODING_AGENT_DIR` points here) |
| Project-level | `<project>\.pi\` | Project overrides (currently not used by any project) |

- ⚠️ The default `~/.pi/agent/` (`C:\Users\14681\.pi\agent\`) is **NOT used**. Do not create config there.
- ⚠️ Back up `D:\Program Files\piagent\.pi\agent\` before reinstalling/upgrading pi (all personal config lives there).

## pi Core Mechanisms Quick Reference

- **Built-in tools**: read / bash / edit / write are the core four; also grep, find, ls, open, WebSearch, subagent, Chrome DevTools, LSP diagnostics, etc. Extensions can override built-in tools with the same name.
- **Context files**: On startup, pi loads `AGENTS.md`/`CLAUDE.md` in order: global → parent directories → current directory (concatenated). Put project-specific conventions in the project AGENTS.md; keep only cross-project content in global.
- **Skills**: Distributed across `D:\Program Files\piagent\.pi\agent\skills\`, project directories, etc. When a task matches, **read the corresponding SKILL.md first** before executing — do not invent workflows.
- **Extensions/packages**: User extensions in `D:\Program Files\piagent\.pi\agent\extensions\`; `pi update --extensions` updates packages. Projects can declare `pi-config.toml` / `package.json` dependencies.
- **Settings**: `D:\Program Files\piagent\.pi\agent\settings.json` (currently: deepseek-v4-pro / deepseek-v4-flash, hideThinkingBlock).
- **Session management**: `/reload` reloads resources (AGENTS.md, skills, extensions). New sessions do not inherit conversation memory — write cross-session persistent info into AGENTS.md or a skill.

## pi Update Convention (Important)

- Always update pi via WSL: `bash "/mnt/d/Program Files/piagent/update-pi.sh"` (the script internally switches to piagent_env's node/npm and validates versions).
- **Do NOT run `npm install @earendil-works/pi-coding-agent` directly**: the default PATH has Node v22.9, which does not satisfy pi's `>=22.19.0` requirement — it will fail with EBADENGINE "version too low".
- piagent_env (Node v26.x, dedicated to pi) is at `D:\ProgramData\Anaconda_envs\envs\piagent_env`, **not in the default PATH**. Only the pi launcher (pi.cmd/pi.ps1/pi) and update-pi.sh reference it.

## Key Loaded Skills & Trigger Conditions

| Skill | Trigger Scenario |
|---|---|
| `linux-driver` | Full driver dev workflow: create chapter, write code, cross-compile, NFS deploy, serial load & test, git commit (platform/spi/i2c/input/char) |
| `hardware-info` | Extract registers, init sequences, pin connections from chip manual PDF / pin diagrams → generate `modules/*.toml` |
| `ppt-master` | Generate/enhance/templatize PPTX presentations |
| `computer-use` | Operate desktop app windows, browser windows, WebView (read UI, click, type) |
| `orca-cli` | Orca-managed worktrees, terminals, repos, embedded browser (distinct from computer-use's general desktop UI) |
| `orchestration` | Multi-agent coordination: task dispatch, DAGs, decision gates, worker waits |
| `tdd` / `diagnosing-bugs` / `code-review` / `codebase-design` / `domain-modeling` / `grilling` / `prototype` / `setup-update` | pi built-in methodology skills, loaded when task matches |

## Driver Dev Environment Quick Reference (details in Linux_Drivers project AGENTS.md)

- **VM** (build environment): SSH `192.168.5.114:9001`, user `tym`; NFS root filesystem and tftp directory are inside the VM.
- **Dev board**: i.MX6ULL, kernel 4.1.15+, serial COM3 @ 115200.
- **Remote Linux absolute paths in bash commands use `//` prefix** (e.g. `//home/tym/...`) to avoid MSYS path conversion.
- Dedicated tools (available in every session): `upload_driver` `build_driver` `deploy_driver` `quick_deploy` `full_deploy_test` (upload → build → deploy → serial verify); `serial_send` `serial_read`; `dts_modify` `dts_build` `dts_verify`; `git_commit_drivers` `cleanup_chapter`.
- Driver workflow: write code → `quick_deploy <chapter>` → load on board → dmesg verify → commit.

## Communication Preferences (changeable anytime)

- **Answer in Chinese** unless the user asks in another language.
- Concise, bullet-style: conclusion first, then necessary details.
- Minimal changes (surgical): only touch files the task requires; don't refactor/format unrelated code. Point out unrelated issues but don't fix them.
- When requirements are ambiguous or have multiple interpretations, list options for confirmation — don't silently pick one.
- Use WebSearch for real-time/latest info (version numbers, doc changes), and cite sources.

## Usage Self-Optimization (from `/metrics`)

Data source: `/metrics` skill parses `sessions/*.jsonl`. Current baseline (2026-09): ~2338 turns / 325M tokens.

- **Working models**: only `deepseek/*` native is usable (`mimo-v2.5-pro`, `volces-ark/*` keys expired). Default `deepseek-v4-flash-vision-exp`.
- **Least thinking**: historical reasoning-token share ≈ 0%. For long-form editing / routine tasks prefer `thinking: low|medium` to save tokens; reserve `high|max` for deep design/review.
- **Trim verbosity**: historical output tokens exceed input — prefer concise, structured answers; tighten prompts.
- **Cache-friendly**: cache-read share ≈ 98% — keep context reuse; avoid breaking session continuity unnecessarily.
- **Cost-aware**: don't use expired providers; periodically `/metrics` to review, `/cleanup` to prune old sessions/logs.
- **Iterate**: every so often run `/iterate` (metrics + baseline delta + recommendations) to verify improvement — avg tokens/turn ↓, reasoning share ↓, cache reuse stable = more efficient. Propose the next `[你]`/`[pi]` action and lock wins into this section.

## Periodic Self-Iteration (周期自检, 阈值 3 天)

At the start of each session (before the first big task), run the period check once:

```bash
bash "D:/Program Files/piagent/.pi/agent/skills/u/metrics/scripts/periodic-check.sh" 3
```

- Output `fresh:...` → skip silently (no mention).
- Output `stale:Ndays` or `no-baseline` → run the iterate cycle:
  1. `python3 "D:/Program Files/piagent/.pi/agent/skills/u/metrics/scripts/metrics.py"` (delta + recommendations)
  2. Show user a 3-4 line digest: what changed since last check + top `[你]`/`[pi]` action; ask if they want to adopt (don't auto-change config).
  3. `python3 "D:/Program Files/piagent/.pi/agent/skills/u/metrics/scripts/metrics.py" --save-baseline` to snapshot this round.

Threshold = 3 days (edit here to change the period). Scripts auto-detect the config/sessions dirs.
