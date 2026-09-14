# scripts — Pi environment management

Versioned copies of the scripts that live in `~/pi/bin`. The **live copies are authoritative**
(`~/pi/bin` is a runtime directory); after changing a live script, copy it here and commit so a
restore can reproduce the setup.

| Script | Purpose |
| --- | --- |
| `pi` | Launcher — pins `PATH`, `PI_CODING_AGENT_DIR`, memory variables, then runs Linux Node + Pi |
| `sync-pi.sh` | Repositories → runtime (`rsync --delete`); `--check` is a read-only drift report |
| `capture-pi.sh` | Runtime → repositories; `--check` reports only, `--prune` removes repo-only files |
| `sync-pi-safely.sh` | Drift check → sync → verify that `sessions/` and the launcher survived |
| `update-pi.sh` | Update the Pi package and verify it still starts; `--check` is read-only |
| `verify-pi.sh` | Non-destructive health check (paths, permissions, services, toolchain) |
| `test-all.sh` | Run every extension unit test with pi's own jiti TS loader |

`sync-pi.sh` also installs the two single files pi reads from the agent directory
(`APPEND_SYSTEM.md`, `web-tools-config.json`) and honours `PI_ROOT` / `PI_CODING_AGENT_DIR`.
It never touches `bin/`; `--check` prints a note when `bin/` and `scripts/` diverge.

## Daily workflow

```bash
bash ~/pi/bin/sync-pi.sh --check    # 1. look for drift
bash ~/pi/bin/capture-pi.sh         # 2. capture runtime edits back into the repositories
bash ~/pi/bin/sync-pi.sh            # 3. apply the sync

# equivalent, with the safety wrapper:
bash ~/pi/bin/sync-pi-safely.sh
```

## Tests

```bash
bash ~/pi/repos/pi-setup/scripts/test-all.sh          # every extension test
bash ~/pi/repos/pi-setup/scripts/test-all.sh --list   # which files would run
npm test                                              # inside a single extension
```

`test-all.sh` loads TypeScript through pi's bundled jiti, so extensions may use either
`"./x.ts"` or `"./x.js"` import specifiers — plain `node --test` cannot resolve the `.js`
form, which is why older packages needed `tsx`.

## Keeping `bin/` and `scripts/` aligned

`bin/` stays authoritative at runtime, so this is manual:

```bash
# repository → runtime (after editing a script here)
install -m 755 ~/pi/repos/pi-setup/scripts/<name> ~/pi/bin/<name>

# runtime → repository (after editing the live script)
cp ~/pi/bin/<name> ~/pi/repos/pi-setup/scripts/<name>
```

`bin/migrate-sessions.py` is a one-shot migration helper that is intentionally not versioned.

## Two rules

1. **`sync-pi.sh` runs `rsync --delete`.** A file that exists only under a synced runtime path
   (`extensions/`, `agents/`, `prompts/`, `skills/`) is deleted on the next sync. Capture it back
   into the repository first, or add it to the repository by hand.

2. **Keep the exclude lists.** `node_modules`, `__pycache__`, `last_model.json`, and
   `eko24ive-pi-ask.json` are deliberate: without them, `--delete` removes runtime-installed
   package dependencies and package-generated settings.

## Notes

- `pi` is included so a restore has the launcher as well; the live file is `~/pi/bin/pi`.
- `update-pi.sh` never pulls the configuration repositories — review `git status` first.
