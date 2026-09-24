# Global Pi Runtime Rules

This file is loaded in every Pi session. Keep it limited to stable invariants; put workflows, tutorials, and historical details in project AGENTS.md files or Skills.

## Runtime Environment

- Start the main Pi through `~/pi/bin/pi`; it uses the Linux Node runtime, `~/pi/app`, and `~/pi/agent`.
- `PI_CODING_AGENT_DIR` is fixed at `/home/tym/pi/agent`; do not write to the default `~/.pi/agent`.
- Bash tools run in WSL Ubuntu; do not nest `wsl.exe` inside Linux Pi extensions or commands.
- `/mnt/d` is a Windows v9fs workspace with unreliable permissions, case, and symlink semantics. Use WSL ext4 when real Linux semantics are required.
- Keep the Windows Pi configuration as a rollback point; do not delete it proactively.

## Configuration and Synchronization

- Runtime configuration: `/home/tym/pi/agent/`; source repositories: `~/pi/repos/pi-setup` and `~/pi/repos/agent-setup`.
- `extensions/`, `agents/`, `prompts/`, `skills/`, and `APPEND_SYSTEM.md` are synchronized paths and must be changed in their source repository first. `settings.json`, `models.json`, `trust.json`, `AGENTS.md`, `bin/`, and runtime package data are maintained directly in the runtime directory.
- Read the relevant repository AGENTS.md before changing synchronized content. Do not let synchronization overwrite unverified local work.
- Use `bash ~/pi/bin/sync-pi.sh --check` for drift checks, `bash ~/pi/bin/verify-pi.sh` for health checks, and `~/pi/bin/update-pi.sh` for Pi upgrades. Do not use the default PATH npm for Pi upgrades.
- Project `.pi` resources take effect only after Project Trust. Do not use `.pi/AGENTS.md` as a Pi context file; put project rules in the project-root AGENTS.md.
- Never place API keys, tokens, passwords, or authentication files in source code, prompts, Skills, AGENTS.md, reports, or Git.

## Tool and Context Discipline

- Prefer `fffind`/`ffgrep` for code discovery and `read` for exact file reads. Use Bash for commands, tests, and builds; do not replace the dedicated search tools with `cat`, `grep`, or `find`.
- Small fixed output may be read directly. Summarize, index, or paginate network/API responses, batch scans, large logs, and large files before they enter the main Context.
- Retrieve details by match location or cursor instead of rereading complete outputs.
- Ask before acting when the target, scope, files, or acceptance criteria could change the implementation. Infer only trivial ambiguities that are safe and architecture-neutral.
- After changes, run focused tests, inspect the diff, and preserve verification evidence. Do not modify unrelated files.

## Subagents and Write Boundaries

- Scout and reviewer agents are fresh and read-only by default. Worker context inheritance is task-specific.
- One repository/cwd has one writer by default. Use a Git worktree only when concurrent writes have clear value.
- Do not automatically create worktrees for `/mnt/d/Linux/Code/Linux_Drivers`; driver development, NFS/TFTP, serial, DTS, and development-service details live in that project's AGENTS.md and `skills/linux-driver`.
- Automatically start an independent reviewer only for high-risk or multi-file refactors; do not add reviewer Context to ordinary small changes.

## Search Infrastructure Invariants

- Pi web search uses the local `web-tools` extension only (`web_search` / `web_fetch`): primary `codex-alpha-search`, fallback `tavily` via `search.routing.fallbackProvider`. The `npm:@mammothb/pi-websearch` package (`WebSearch`) was removed from `settings.json` on 2026-09-24 so Docker stays out of the Pi startup path; re-adding that package line is the rollback.
- Search credentials live only in `~/pi/agent/web-tools-secrets.json` (0600, runtime-owned, never synced and never committed; `TAVILY_API_KEY` in the environment overrides it). Never put secrets into `web-tools-config.json`, which is synced from the repository.
- The Docker SearXNG stack is retained but disabled (containers stopped, `searxng.service` disabled). Its single compose source stays at `~/pi/repos/pi-setup/searxng/docker-compose.yml`, managed manually through `/mnt/d/Linux/searxng-manage.sh` (which preflights Docker and prints one line when the engine is unavailable).
- Before changing search infrastructure, run the manage-script status check plus a web-tools `web_search` smoke test.

## Usage Discipline and Periodic Self-Check

- Model routing: keep the main model for complex implementation; route scouting and routine search to a fast tier. Use `low` thinking for exploration, `medium` for implementation, and `high` only for diagnosis, review, or high-risk changes.
- Keep replies concise and structured; do not repeat tool output. Preserve coherent sessions for cache reuse, and use `/new`, `/fork`, or `/compact` when context turns noisy.
- Inspect `/metrics` before changing model routing; run `/iterate` periodically to check the trend.
- At the start of a session, before the first large task, run `bash "/home/tym/pi/agent/skills/u/metrics/scripts/periodic-check.sh" 3` once. `fresh:...` means say nothing. `stale:Ndays` or `no-baseline` means run the metrics report, give a 3-4 line digest plus the top `[you]`/`[pi]` action, ask before changing any config, then save a new baseline.

## Communication and Change Policy

- Use English in Pi configuration, extensions, Skills, prompts, comments, and runtime UI text. User-facing conversation may remain Chinese.
- Prefer the smallest change. Do not copy third-party Harness architectures; validate candidate mechanisms against this local Pi setup for compatibility, measurable benefit, and rollback.
- Back up before each phase, then modify, test, and review. If a hard regression appears, stop, preserve the evidence and diff, and wait for confirmation before rolling back.
