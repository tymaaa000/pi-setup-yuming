#!/usr/bin/env bash
# Repository configuration is authoritative. Default is read-only; --apply approves deployment.
set -euo pipefail
MODE=check
case "${1:-}" in
  ""|--check|-n) ;;
  --apply) MODE=apply ;;
  --help|-h)
    echo "Usage: sync-pi.sh [--check|--apply]"
    echo "Preview differences first; register local choices in the repositories before --apply."
    exit 0
    ;;
  *) echo "Usage: sync-pi.sh [--check|--apply]" >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || { echo "Too many arguments" >&2; exit 2; }
ROOT="${PI_ROOT:-$HOME/pi}"
SRC="$ROOT/repos/pi-setup/agent"
DST="${PI_CODING_AGENT_DIR:-$ROOT/agent}"
SKILL_SOURCE="$ROOT/repos/agent-setup"
SKILL_HOME="${SKILLCTL_HOME:-$HOME/.agents}"
case "$DST" in ""|/) echo "Unsafe destination" >&2; exit 1 ;; esac
for path in "$SRC" "$DST" "$SKILL_SOURCE" "$SKILL_HOME"; do
  [ -d "$path" ] || { echo "Missing directory: $path" >&2; exit 1; }
done
for name in extensions agents prompts; do
  [ -d "$SRC/$name" ] || { echo "Missing source directory: $SRC/$name" >&2; exit 1; }
done
[ "$(realpath "$SRC")" != "$(realpath "$DST")" ] || { echo "Source and destination must differ" >&2; exit 1; }

# Validate every declared file before deployment. Ignore only machine-generated settings.
rc=0
config_rc=0
python3 - "$SRC" "$DST" "$MODE" <<'PY' || config_rc=$?
import json
import os
from pathlib import Path
import stat
import sys
import tempfile

source, destination = map(Path, sys.argv[1:3])
mode = sys.argv[3]
generated = ("lastChangelogVersion", "deviceId")
entries = []
try:
    for name in ("settings.json", "models.json", "pi-kits.json", "keybindings.json"):
        declared = json.loads((source / name).read_text())
        path = destination / name
        current = json.loads(path.read_text()) if path.exists() else {}
        if not isinstance(declared, dict) or not isinstance(current, dict):
            raise ValueError(name)
        target = dict(declared)
        if name == "settings.json":
            for key in generated:
                target.pop(key, None)
                if key in current:
                    target[key] = current[key]
        entries.append((path, current, target))
except (OSError, ValueError):
    print("Cannot read declared/runtime configuration; review files before deployment.", file=sys.stderr)
    sys.exit(2)

changed = [(path, target) for path, current, target in entries if current != target]
for path, target in changed:
    print(f"Configuration differs: {path.name} (review local edits before --apply)")
    if mode == "apply":
        permissions = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o600
        fd, temporary = tempfile.mkstemp(prefix=f".{path.name}-", dir=destination)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(target, stream, indent=2, ensure_ascii=False)
                stream.write("\n")
            os.chmod(temporary, permissions)
            os.replace(temporary, path)
        finally:
            Path(temporary).unlink(missing_ok=True)
if not changed:
    print("Declared Pi configuration matches runtime (generated settings excluded).")
sys.exit(1 if changed and mode == "check" else 0)
PY
if [ "$config_rc" -ne 0 ]; then
  if [ "$MODE" = apply ] || [ "$config_rc" -ne 1 ]; then
    echo "Configuration processing failed; resource deployment was not started." >&2
    exit 1
  fi
  rc=1
fi

# Do not copy a whole runtime tree: only these source-owned resources are deployed.
EX=(--exclude=node_modules --exclude=__pycache__ --exclude=last_model.json --exclude=eko24ive-pi-ask.json)
for name in extensions agents prompts; do
  if [ "$MODE" = apply ]; then
    rsync -ac --omit-dir-times --prune-empty-dirs --delete "${EX[@]}" "$SRC/$name/" "$DST/$name/"
  else
    changes="$(rsync -ainc --omit-dir-times --prune-empty-dirs --delete "${EX[@]}" "$SRC/$name/" "$DST/$name/")"
    if [ -n "$changes" ]; then
      echo "Resource differences: $name"
      printf '%s\n' "$changes"
      rc=1
    fi
  fi
done
if [ -f "$SRC/APPEND_SYSTEM.md" ]; then
  if [ "$MODE" = apply ]; then
    cp "$SRC/APPEND_SYSTEM.md" "$DST/APPEND_SYSTEM.md"
  elif ! cmp -s "$SRC/APPEND_SYSTEM.md" "$DST/APPEND_SYSTEM.md"; then
    echo "Resource differs: APPEND_SYSTEM.md"
    rc=1
  fi
fi
if ! cmp -s "$SKILL_SOURCE/config.toml" "$SKILL_HOME/config.toml"; then
  echo "Skills configuration differs; review the native worktree against local agent-setup."
  rc=1
else
  echo "Native Skills configuration matches the local source."
fi
if [ "$MODE" = check ]; then
  echo "Preview only. Keep wanted runtime changes in Git before applying."
else
  echo "Pi configuration deployed; private files, sessions, memory, and package caches were not copied or deleted."
  echo "Reconcile changed package declarations with pi update --extensions when ready."
fi
exit "$rc"
