# AGENTS.md

## Live repository layout

This checkout is also the live Pi runtime. Edit configuration directly in `agent/`; there is no separate source checkout or deployment script. Skills are configured directly in the `~/.agents` Git worktree. Review `.gitignore` and private-file exclusions before staging. Never commit authentication, sessions, memory, installed releases/packages, or recovery data. Preserve existing local changes and Git history; no automatic commits or pushes.

## Biome Workflow

We use Biome for formatting, linting, and import sorting.

**Critical workflow:**
1. Run `npx biome check .` (read-only) to verify code quality
2. **ONLY after check passes**, run `npx biome format --write .` to format
3. Commit the formatted code

**Commands:**
- `npx biome check .` → Quality validation (lint + import sort, read-only)
- `npx biome format --write .` → Apply formatting after check passes
- `npx biome ci .` → CI checks (read-only, fail on issues)

**Rules:**
- **NEVER** run `format --write` before `check` passes
- **NEVER** use `--write` in CI
- Configuration in `biome.json`
