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

- Keep the `pi-websearch.json` SearXNG script at `/mnt/d/Linux/searxng-manage.sh`; SearXNG is persistent and must not depend on a Pi session lifecycle.
- Keep one SearXNG compose source. Before changing search infrastructure, run its status check and an HTTP JSON smoke test.

## Communication and Change Policy

- Use English in Pi configuration, extensions, Skills, prompts, comments, and runtime UI text. User-facing conversation may remain Chinese.
- Prefer the smallest change. Do not copy third-party Harness architectures; validate candidate mechanisms against this local Pi setup for compatibility, measurable benefit, and rollback.
- Back up before each phase, then modify, test, and review. If a hard regression appears, stop, preserve the evidence and diff, and wait for confirmation before rolling back.
