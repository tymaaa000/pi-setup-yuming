# Global Environment & Working Conventions (pi Global Context)

> This file is auto-loaded at the start of every session (concatenated with project-level AGENTS.md).
> After editing, use `/reload` to hot-reload. Keep it concise — it consumes each session's context budget.

## Identity / Runtime Environment

- Running on **pi** (AI coding assistant); Windows host, bash commonly runs through WSL2. Verify the runtime with `uname -a` and use `/mnt/d/...` paths in WSL; do not assume MSYS path conversion.
- pi is installed at `D:\Program Files\piagent`; **config directory**: `D:\Program Files\piagent\.pi\agent\` (set by env var `PI_CODING_AGENT_DIR`, not the default `~/.pi/agent/`).
- pi docs: `D:\Program Files\piagent\node_modules\@earendil-works\pi-coding-agent\README.md` and `docs/` (skills/extensions/themes/SDK etc. are documented there; check here first for pi internals).
- Primary working directories under `D:\Linux\Code\` (Linux_Drivers / debug / ppt / tool / start / code backups).
- Main task: **embedded Linux driver development** (i.MX6ULL, see project AGENTS.md for details).

## Config Path Hierarchy (confusing — check here before configuring)

| Level | Path | Purpose |
|---|---|---|
| pi binary (read-only) | `D:\Program Files\piagent\` | pi program itself, do not modify manually |
| Config directory (effective) | `D:\Program Files\piagent\.pi\agent\` | Global AGENTS.md, settings.json, auth.json, extensions, skills, sessions, git packages (`PI_CODING_AGENT_DIR` points here) |
| Project-level | `<project>\.pi\` | Project overrides; loaded **only after the project is trusted** (`.pi/settings.json`, `.pi/extensions/`, `.pi/skills/`, `.pi/prompts/`). Note: `.pi/AGENTS.md` is **not** a pi context-file location — use the project root `AGENTS.md` instead. |

- ⚠️ The default `~/.pi/agent/` (`C:\Users\14681\.pi\agent\`) is **NOT used**; `PI_CODING_AGENT_DIR` is set in the Windows user environment. Do not create config there.
- ⚠️ Project resources require a trust decision (`trust.json` or `/trust`). Without it, `pi -p`, subagents, and extension-spawned child processes silently skip `.pi/settings.json`, project skills, project extensions, and the project `package.json` pi manifest. Trusted projects currently: `D:\Linux\Code\Linux_Drivers`.
- ⚠️ Back up `D:\Program Files\piagent\.pi\agent\` before reinstalling/upgrading pi (all personal config lives there).
- Never put API keys in `models.json`, prompts, skills, AGENTS.md, or repositories; use environment variables or pi auth storage.

## pi Core Mechanisms Quick Reference

- **Built-in tools**: read / bash / edit / write are the core four; also grep, find, ls, open, WebSearch, subagent, Chrome DevTools, LSP diagnostics, etc. Extensions can override built-in tools with the same name.
- **Context files**: On startup, pi loads `AGENTS.md`/`CLAUDE.md` in order: global → parent directories → current directory (concatenated). Put project-specific conventions in the project AGENTS.md; keep only cross-project content in global.
- **Skills**: Distributed across `D:\Program Files\piagent\.pi\agent\skills\`, project directories, etc. When a task matches, **read the corresponding SKILL.md first** before executing — do not invent workflows.
- **Extensions/packages**: User extensions in `D:\Program Files\piagent\.pi\agent\extensions\`; `pi update --extensions` updates packages. Projects can declare `pi-config.toml` / `package.json` dependencies.
- **Settings**: `D:\Program Files\piagent\.pi\agent\settings.json`; current default is `openai-codex/gpt-5.6-luna` with `medium` thinking. Treat `settings.json` and the model registry as the source of truth.
- **Session management**: `/reload` reloads resources (AGENTS.md, skills, extensions). New sessions do not inherit conversation memory — write cross-session persistent info into AGENTS.md or a skill.

## Config Source of Truth (pi-setup / agent-setup) — read before editing config

`.pi/agent/` is **synced from two git repos**. A change under a synced path that is not also in the repo is destroyed on the next sync.

| Synced path | Source | Mode |
|---|---|---|
| `extensions/` | `pi-setup/agent/extensions/` | `rsync --delete` (runtime-only files deleted) |
| `agents/` | `pi-setup/agent/agents/` | `rsync --delete` |
| `prompts/` | `pi-setup/agent/prompts/` | `rsync --delete` |
| `skills/` | `agent-setup/skills/` | `rsync --delete` |
| `APPEND_SYSTEM.md` | `pi-setup/agent/APPEND_SYSTEM.md` | `cp` |
| `web-tools-config.json` | `pi-setup/agent/web-tools-config.json` | `cp` |

**NOT synced — edit the runtime copy directly:** `settings.json`, `pi-websearch.json`, `models.json`, `subagent-model.json`, `auth.json`, `trust.json`, `pi-lsp.json`, `AGENTS.md`, `keybindings.json`, `sessions/`, `npm/`, `git/`, `bin/`.

- Sync command: `bash "/mnt/d/Program Files/piagent/sync-pi.sh"`.
- Adding a new file under a synced path **requires adding it to the repo too** (per `pi-setup/AGENTS.md` Migration Rule: verified local additions are retained in the fork).
- Verify idempotency: `diff -rq pi-setup/agent/extensions .pi/agent/extensions` etc. should be empty.

## Search Toolchain (both paths must keep working)

| Tool | Backend | Paired subagent |
|---|---|---|
| `WebSearch` (`npm:@mammothb/pi-websearch`) | local SearXNG `http://localhost:8888` | `websearch` (deepseek) |
| `web_search` / `web_fetch` (`extensions/web-tools`) | `codex-alpha-search` (GPT Plus quota), SearXNG fallback | `websearch-gpt` (openai-codex) |

Invariants — breaking any of these silently kills the DeepSeek search path:

1. **SearXNG is persistent.** `/mnt/d/Linux/searxng-manage.sh down` is intentionally a **no-op** and containers use `restart: always`. Search must not depend on pi's session lifecycle (a session-start/stop cycle is what used to leave it down).
2. **`pi-websearch.json` → `searxng.script` must stay the WSL path** `/mnt/d/Linux/searxng-manage.sh`. The package spawns `C:/Windows/System32/bash.exe -c "<script> up"`, which cannot resolve Windows-style paths. Using the WSL path means the **upstream default bash works**, so `pi update --extensions` cannot break it. Do NOT switch to a `D:/...` path — that needs a git-bash patch inside the package that npm reinstalls away.
3. **Exactly one SearXNG compose source**: `pi-setup/searxng/docker-compose.yml`, driven by `D:\Linux\searxng-manage.sh`. Duplicate compose files sharing `name: searxng` / `container_name: searxng-core` caused `container name is already in use` failures; the script therefore checks liveness with `docker ps --filter name=^/searxng-core$` (config-agnostic) instead of per-compose `ps`.
4. Docker Desktop autostart must stay enabled (`AutoStart: true`).

Verify both paths:

```bash
bash /mnt/d/Linux/searxng-manage.sh status
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:8888/search?q=t&format=json'   # expect 200
```

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
| `tdd` / `diagnosing-bugs` / `code-review` / `codebase-design` / `domain-modeling` / `grilling` / `prototype` | Methodology skills, loaded when task matches |
| `setup-update` / `cleanup` / `metrics` / `iterate` / `implement` / `teach` / `to-spec` / `to-tickets` | Local utility skills, loaded explicitly or when the task matches |

## Driver Dev Environment Quick Reference (details in Linux_Drivers project AGENTS.md)

- **VM** (build environment): SSH `192.168.5.114:9001`, user `tym`; NFS root filesystem and tftp directory are inside the VM.
- **Dev board**: i.MX6ULL, kernel 4.1.15+, serial COM3 @ 115200.
- **Remote Linux paths**: use the convention required by the active shell. In WSL use `/home/tym/...` or `/mnt/...`; the `//` workaround applies only when the command is actually executed by MSYS/Git Bash.
- Dedicated tools (available in every session): `upload_driver` `build_driver` `deploy_driver` `quick_deploy` `full_deploy_test` (upload → build → deploy → serial verify); `serial_send` `serial_read`; `dts_modify` `dts_build` `dts_verify`; `git_commit_drivers` `cleanup_chapter`.
- Driver workflow: write code → `quick_deploy <chapter>` → load on board → dmesg verify → commit.

## Communication Preferences (changeable anytime)

- **Answer in Chinese** unless the user asks in another language.
- Concise, bullet-style: conclusion first, then necessary details.
- Minimal changes (surgical): only touch files the task requires; don't refactor/format unrelated code. Point out unrelated issues but don't fix them.
- When requirements are ambiguous or have multiple interpretations, list options for confirmation — don't silently pick one.
- Use WebSearch for real-time/latest info (version numbers, doc changes), and cite sources.

## Usage Self-Optimization (from `/metrics`)

Data source: `/metrics` skill parses `sessions/*.jsonl`; do not hard-code historical token or session counts here.

- **Model routing**: main and complex implementation use `openai-codex/gpt-5.6-luna`; Explore and routine search may use fast DeepSeek models; review/diagnosis may use `high` thinking.
- **Least thinking**: use `low` for exploration and routine tasks, `medium` for implementation, and `high` only for diagnosis/review/high-risk changes.
- **Trim verbosity**: prefer concise, structured replies and avoid repeating tool output.
- **Cache-friendly**: preserve coherent sessions; use `/new`, `/fork`, or `/compact` when context becomes noisy.
- **Cost-aware**: inspect real session statistics before changing model routing.
- **Iterate**: every so often run `/iterate` (metrics + baseline delta + recommendations) to verify improvement — avg tokens/turn ↓, reasoning share ↓, cache reuse stable = more efficient. Propose the next `[你]`/`[pi]` action and lock wins into this section.

## Periodic Self-Iteration (周期自检, 阈值 3 天)

At the start of each session (before the first big task), run the period check once:

```bash
bash "/mnt/d/Program Files/piagent/.pi/agent/skills/u/metrics/scripts/periodic-check.sh" 3
```

- Output `fresh:...` → skip silently (no mention).
- Output `stale:Ndays` or `no-baseline` → run the iterate cycle:
  1. `python3 "/mnt/d/Program Files/piagent/.pi/agent/skills/u/metrics/scripts/metrics.py"` (delta + recommendations)
  2. Show user a 3-4 line digest: what changed since last check + top `[你]`/`[pi]` action; ask if they want to adopt (don't auto-change config).
  3. `python3 "/mnt/d/Program Files/piagent/.pi/agent/skills/u/metrics/scripts/metrics.py" --save-baseline` to snapshot this round.

Threshold = 3 days (edit here to change the period). Scripts auto-detect the config/sessions dirs.
