# AGENTS.md

## Biome Workflow

We use Biome for formatting, linting, and import sorting.

**Use the scoped package name.** The bare name resolves to an unrelated legacy
package (`biome@0.3.3`) and silently does nothing useful:

```bash
npx @biomejs/biome check .        # ✅ correct
npx biome check .                 # ❌ wrong package, no useful output
```

Biome is not installed locally and is fetched on demand, so a check is only
meaningful once the download succeeds — confirm with `npx @biomejs/biome --version`
before trusting a silent run.

**Commands:**
- `npx @biomejs/biome check .` → Quality validation (lint + import sort, read-only)
- `npx @biomejs/biome format --write <paths>` → Apply formatting after check passes
- `npx @biomejs/biome ci .` → CI checks (read-only, fail on issues)

**Rules:**
- **NEVER** run `format --write` before `check` passes
- **NEVER** use `--write` in CI
- **NEVER** run `format --write .` across the whole repo: the existing files use
  mixed indentation (some TAB, most 2-space) while `biome.json` declares
  `indentStyle: "tab"`, so a repo-wide format would rewrite ~90 files and bury
  real changes. Scope `--write` to the files you actually touched.
- Configuration in `biome.json`

## Migration Rule

Upstream changes are adopted only when they improve this setup without breaking
local providers, models, agents, extensions, skills, or workflows. Shared files
use the upstream version as a base and retain verified local additions; local-
only files are preserved until an equivalent replacement has been tested.
