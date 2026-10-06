# Pi configuration and runtime

This checkout at `~/pi/` is both the configuration repository and the live Pi runtime. It follows the upstream `agent/` layout; there is no separate configuration source or deployment step.

- `origin`: `git@github.com:tymaaa000/pi-setup-yuming.git`
- `upstream`: `git@github.com:aqua2k1/pi-setup.git`
- Skills run directly from the standalone Git repository at `~/.agents/`, on `main`, with `origin` pointing to `tymaaa000/agent-setup-yuming` and `upstream` to `aqua2k1/agent-setup`.

## Edit the running configuration

Edit `agent/settings.json`, `agent/models.json`, `agent/pi-kits.json`, `agent/keybindings.json`, `agent/APPEND_SYSTEM.md`, and the `agent/agents/`, `agent/extensions/`, and `agent/prompts/` resources directly here. Native Pi settings/package operations change these same files; review their Git diffs before committing. Generated settings such as `lastChangelogVersion` follow normal native Pi behavior, without a deployment filter.

Local choices include `npm:pi-cn` and the `grilling` Skill. Keep intentional choices when reviewing upstream changes. Private authentication, trust, memory, sessions, extension state, installed packages, and official Pi releases stay in place but are excluded from Git. The local runtime rules in `agent/AGENTS.md` remain private. Never commit credentials, private documents, or a whole installed package directory.

Skills configuration is edited directly in `~/.agents/config.toml`. Run upstream's own tool there when changing the selected Skills:

```bash
cd ~/.agents
uv sync --locked
uv run skillctl sync
```

The Skills repository is self-contained at `~/.agents/`, including its own `.git/` history, branches, tags, and remote configuration. No auxiliary checkout or external Git metadata is required; the old `~/pi/repos/agent-setup/` directory has been retired.

## Runtime and program updates

The shared WSL Node/npm/Codex/Biome/Corepack toolchain lives at `~/.local/opt/node/`, independently of Pi. Official managed Pi lives in `agent/install/`; its generated launcher is `agent/bin/pi`. The small `~/pi/bin/pi` entry delegates to tracked `scripts/pi`, preserving the shared Linux PATH and `PI_CODING_AGENT_DIR=$HOME/pi/agent`.

```bash
~/pi/bin/pi
~/pi/bin/pi update                    # native Pi program update
~/pi/bin/pi update --extensions       # native package update
~/pi/bin/verify-pi.sh                 # read-only startup/auth-permission check
```

There is no custom Pi updater, configuration deployment script, or bulk upstream-update helper. Installed binaries, official update metadata, machine-local entries in `bin/`, and recovery data in `backups/` are not committed. The tracked scripts are only the necessary launcher and minimal runtime checker.

For a future official reinstall, inspect the official installer, put its launcher ahead of the local wrapper, and keep the configuration directory:

```bash
curl -fsSL https://pi.dev/install.sh -o /tmp/pi-install.sh
PATH="$HOME/.local/opt/node/bin:$HOME/pi/agent/bin:/usr/local/bin:/usr/bin:/bin" \
  PI_CODING_AGENT_DIR="$HOME/pi/agent" sh /tmp/pi-install.sh
```

## Git and upstream changes

```bash
lazygit -p ~/pi
lazygit -p ~/.agents
```

Fetch `upstream`, inspect changes, and merge `upstream/main` using ordinary Git or Lazygit in each running worktree. Review existing local edits first. Resolve conflicts explicitly; do not copy upstream files over local choices, force-reset, or automatically commit/push. A reviewed merge changes the actual running configuration, so reload Pi when appropriate. Program updates and Skill/package synchronization remain separate native operations.
