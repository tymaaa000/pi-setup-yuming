# Pi configuration

Upstream: `aqua2k1/pi-setup`. This fork keeps the same declarative configuration layout.

## Configuration sources

- `agent/settings.json`: model/tool choices and package declarations. Local additions currently include `npm:pi-cn`; installed package files are not committed.
- `agent/models.json`, `agent/pi-kits.json`, `agent/keybindings.json`: reviewed configuration deployed to the runtime.
- `agent/extensions/`, `agent/agents/`, `agent/prompts/`, `agent/APPEND_SYSTEM.md`: source-owned resources.
- Skills use the separate `agent-setup` fork and its `config.toml`; `grilling` is an explicit local choice.
- `scripts/`: the local Pi launcher, Pi updater/checker, and configuration fetch/deployment scripts needed by this machine. Runtime `~/pi/bin` entries delegate to these tracked implementations.

Authentication, private state, sessions, memory, installed packages, CUDA, and model/index caches are not configuration source files. Never commit credentials or copy a whole runtime directory into this repository.

## Shared Linux toolchain

Node and its global tools live independently of Pi in `~/.local/opt/node/`. Add `~/.local/opt/node/bin` and `~/pi/bin` to your shell PATH. The tracked Pi launcher selects this Linux Node explicitly; the updater also selects its npm and prepends the shared toolchain to PATH. No Windows Node or Codex binary is used.

Current tool versions are Node `24.21.0`, npm `11.19.0`, Corepack `0.36.0`, Biome `2.5.14`, and Codex CLI `0.160.0`. Codex's version is constrained by the installed pi-kits native-review protocol, not by where the CLI is installed. Installed binaries and authentication are not committed here. Toolchain upgrades remain separate from `update-pi.sh`, which only upgrades Pi.

The relocation is complete: `~/pi/node` no longer exists. The shared toolchain is not a Pi-owned installation or a deployment output.

## Follow upstream

```bash
~/pi/bin/update-upstream.sh             # fetch only; no merge, commit, push, or install
lazygit -p ~/pi/repos/pi-setup
lazygit -p ~/pi/repos/agent-setup
```

In each repository, review and merge `upstream/main` using normal Git or Lazygit. For a command-line merge that pauses before creating a commit:

```bash
git merge --no-commit --no-ff upstream/main
```

Resolve conflicts, retain intentional local choices, and commit when satisfied. No updater copies upstream files over local choices or automatically creates commits. Existing uncommitted edits must be reviewed before merging.

## Deploy reviewed configuration

```bash
~/pi/bin/sync-pi.sh --check             # default is also read-only
~/pi/bin/sync-pi.sh --apply             # explicitly approve source -> runtime deployment
```

The preview reports configuration/resource differences. Before applying, register any wanted runtime edits in the source files. The deployment preserves runtime `lastChangelogVersion` and `deviceId`; other settings come from this repository. Authentication, trust, memory, sessions, and package caches are outside its copy scope.

Package declarations are installed with native `pi install` or reconciled with `pi update --extensions` separately. Record additions in `agent/settings.json`, not only in runtime settings. Deployment does not install packages.

The native `~/.agents` worktree shares Git history with `~/pi/repos/agent-setup`. After reviewing and committing that fork, advance the worktree to the local commit, not directly to upstream:

```bash
git -C ~/.agents checkout --detach "$(git -C ~/pi/repos/agent-setup rev-parse HEAD)"
cd ~/.agents
uv sync --locked
uv run skillctl sync
```

Do not force checkout over native worktree edits. Use the upstream test commands in a development environment when changing upstream code; there is no custom test runner or blanket test-green gate here.
