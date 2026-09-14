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

## Daily workflow

```bash
bash ~/pi/bin/sync-pi.sh --check    # 1. look for drift
bash ~/pi/bin/capture-pi.sh         # 2. capture runtime edits back into the repositories
bash ~/pi/bin/sync-pi.sh            # 3. apply the sync

# equivalent, with the safety wrapper:
bash ~/pi/bin/sync-pi-safely.sh
```

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
