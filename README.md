# pi-setup

> Versioned configuration for a Linux-native **Pi** coding-agent setup running inside WSL.
> `agent/` mirrors the runtime agent directory, `scripts/` syncs it, and secrets or
> machine-local state stay out of Git.

## Runtime layout

| Path | Purpose |
| --- | --- |
| `~/pi/bin/pi` | Launcher — pins `PATH`, `PI_CODING_AGENT_DIR`, memory variables, then runs Linux Node + Pi |
| `~/pi/app` | Pi installation (`@earendil-works/pi-coding-agent`) |
| `~/pi/node` | Linux Node used by the launcher and package operations |
| `~/pi/agent` | Runtime agent directory (`PI_CODING_AGENT_DIR`) — the sync target |
| `~/pi/repos/pi-setup` | This repository — engine configuration |
| `~/pi/repos/agent-setup` | Skills repository, sourced into `agent/skills` during sync |

`~/.pi/agent` is intentionally unused on this machine; always start Pi through `~/pi/bin/pi`.

## Repository map

```
pi-setup/
├── AGENTS.md              # rules for agents editing this repository (Biome, upstream policy)
├── biome.json / tsconfig.json
├── agent/                 # mirror of the runtime agent directory
│   ├── agents/            # subagent definitions (Explore, review, websearch, …)
│   ├── extensions/        # Pi extensions (table below)
│   ├── prompts/           # prompt templates
│   ├── APPEND_SYSTEM.md   # appended to the system prompt
│   ├── pi-lsp.json        # LSP server configuration
│   ├── pi-websearch.json  # search configuration (local SearXNG)
│   └── settings.json      # reference copy; the runtime copy is authoritative
├── scripts/               # sync / capture / update helpers (installed in ~/pi/bin)
└── searxng/               # self-hosted search backend (compose + settings)
```

`settings.json`, `AGENTS.md`, `keybindings.json`, `pi-lsp.json`, `pi-websearch.json`, and
`trust.json` are **runtime-owned**: `sync-pi.sh` does not manage them, so the live copies under
`~/pi/agent` win.

## Sync workflow

```bash
bash ~/pi/bin/sync-pi.sh            # repo → runtime (rsync --delete)
bash ~/pi/bin/sync-pi.sh --check    # read-only drift check
bash ~/pi/bin/capture-pi.sh         # runtime → repo (never deletes repo files)
bash ~/pi/bin/verify-pi.sh          # health check
~/pi/bin/update-pi.sh               # upgrade Pi itself
```

Synced paths: `extensions/`, `agents/`, `prompts/`, and `skills/`, using `rsync --delete`.
A file that exists only in the runtime copy is **deleted** on the next sync, so anything worth
keeping must be captured back into this repository first.

## Extensions

| Extension | Purpose |
| --- | --- |
| `commit/` | `/commit` — staged diff → generated message → confirm → `git commit` |
| `stats/` | `/stats` usage report and `/context-budget` Context telemetry |
| `context-guard/` | Blocks unbounded large `read` (> 32 KB); clamps `grep`/`ffgrep` page size |
| `skill-visibility.ts` | Hides skills from the model prompt (`skillful.hideAllSkills`); explicit `/skill:name` still works |
| `web-tools/` | `web_search` / `web_fetch` (local SearXNG plus Codex providers) |
| `terminal.ts` | `/vim`, `/lg` (lazygit), `/fm` (yazi) |
| `safety/` | Interactively confirms high-impact shell commands |
| `provider-usage/` | Provider quota display |
| `subagent-model/` | Subagent model selection |
| `notify/`, `profile/`, `open.ts`, `preview.ts`, `context-preview.ts`, `auto-name-session.ts`, `expand-default.ts`, `native-cursor.ts` | Small workflow and UI utilities |

## Context-efficiency stack

- `AGENTS.md` was slimmed from ~15 KB to ~4 KB; workflow details moved into skills and project files.
- `@ff-labs/pi-fff` runs in `override` mode: frecency-ranked, paginated `grep`/`find` replace the built-ins.
- `context-guard/` blocks unbounded reads above 32 KB and caps search pages at 20 matches / 3 context lines.
- `/context-budget` reports system-prompt, provider-payload, and session tool-output sizes.
- All skills are hidden from the model prompt; they remain explicitly invocable.
- `pi-auto-compact@1.2.3` preflights compaction at 78% of the context window; Pi native compaction remains the safety net.
- `@eko24ive/pi-ask@1.2.0` adds structured clarification before ambiguous work.

Two decisions from local A/B measurements:

- Keep `@gotgenes/pi-subagents`; the upstream `pi-subagents` package costs roughly 70 % more static
  prompt (tool schema ~11.9 KB vs ~1.7 KB) with no behavior gain here.
- Do not enable `context-mode`: its sandbox inherits full process permissions, so a read-only
  boundary cannot be enforced.

## Packages

Pinned in the runtime `settings.json`:

```
npm:@ff-labs/pi-fff
npm:@mammothb/pi-websearch
npm:@gotgenes/pi-subagents
npm:@narumitw/pi-chrome-devtools
npm:@narumitw/pi-lsp
npm:@narumitw/pi-btw
npm:pi-memory
npm:pi-auto-compact@1.2.3
npm:@eko24ive/pi-ask@1.2.0
```

Git packages: `ASu-skills`, `ppt-master`, `Chinese-Resume-in-Typst`.

## Secrets and local state

`.gitignore` excludes `agent/auth.json`, `agent/models.json`, `agent/trust.json`,
`agent/subagent-model.json`, `agent/model-alias.json`, `agent/pi-chrome-devtools.json`,
session data, and npm/git runtime state. `models.json` can contain provider `apiKey` values —
never commit it or paste its contents into issues.

Provider credentials live in `agent/auth.json` (untracked) or in environment variables.

## Environment

- WSL Ubuntu; Pi runs as a real Linux process, so extensions must not nest `wsl.exe`.
- Local SearXNG at `http://localhost:8888`, defined in `searxng/docker-compose.yml` and kept
  persistent, independent of any Pi session.
- Web search falls back between the local SearXNG backend and the Codex search provider.

## Provenance

Fork of [aqua2k1/pi-setup](https://github.com/aqua2k1/pi-setup) (remote `upstream`), adapted for a
Linux-native WSL setup. Upstream changes are merged selectively; see `AGENTS.md`.
