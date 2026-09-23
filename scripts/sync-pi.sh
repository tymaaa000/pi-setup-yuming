#!/bin/bash
# sync-pi.sh — sync the configuration repositories (pi-setup / agent-setup) into the Pi
# agent directory.
#
# Usage:
#   bash ~/pi/bin/sync-pi.sh            apply the sync
#   bash ~/pi/bin/sync-pi.sh --check    report drift only; change nothing
#   bash ~/pi/bin/sync-pi.sh --help
#
# Layout (override with PI_ROOT / PI_CODING_AGENT_DIR):
#   PI_ROOT/repos/pi-setup/agent      → PI_CODING_AGENT_DIR (or PI_ROOT/agent)
#   PI_ROOT/repos/agent-setup/skills  → <agent dir>/skills
#
# Synced paths: extensions/ agents/ prompts/ skills/ plus the single files
# APPEND_SYSTEM.md and web-tools-config.json (pi reads both from the agent dir).
# Runtime-owned files (settings.json, trust.json, keybindings.json, bin/, npm/, git/,
# sessions/, memory/, …) are never touched by this script.
set -euo pipefail

ROOT="${PI_ROOT:-$HOME/pi}"
REPOS="$ROOT/repos"
REPO_DIR="$REPOS/pi-setup"
SRC="$REPO_DIR/agent"
SRC_SKILLS="$REPOS/agent-setup/skills"
DST="${PI_CODING_AGENT_DIR:-$ROOT/agent}"

usage() {
  cat <<'EOF'
Usage: sync-pi.sh [--check|-n] [--help]

  (no argument)  sync repositories → agent directory
  --check, -n    report drift only; change nothing
  --help         show this message

Environment:
  PI_ROOT                installation root (default: ~/pi)
  PI_CODING_AGENT_DIR    destination agent dir (default: $PI_ROOT/agent)
EOF
}

CHECK=0
case "${1:-}" in
  "") ;;
  --check|-n) CHECK=1 ;;
  -h|--help) usage; exit 0 ;;
  *) echo "❌ Unknown argument: $1" >&2; usage >&2; exit 2 ;;
esac

for d in "$REPOS" "$SRC" "$SRC_SKILLS" "$DST"; do
  [ -d "$d" ] || { echo "❌ Missing directory: $d — aborting" >&2; exit 1; }
done

# Runtime-owned package settings may be generated inside synchronized directories.
# Keep them local; do not let repository sync delete user-owned package state.
EX=(--exclude=node_modules --exclude=__pycache__ --exclude=last_model.json --exclude=eko24ive-pi-ask.json)

PAIRS=(
  "extensions:$SRC/extensions"
  "agents:$SRC/agents"
  "prompts:$SRC/prompts"
  "skills:$SRC_SKILLS"
)

# Single files pi reads from the agent directory; the repository copy is the source.
FILES=(APPEND_SYSTEM.md web-tools-config.json)

# Runtime-owned mirrors: the repository keeps a reference copy, but the runtime wins.
# Differences are reported as a note only — they never fail a drift check.
MIRRORS=(settings.json pi-lsp.json pi-websearch.json pi-fff.json pi-auto-compact.json \
         subagent-model.json models.json models-store.json trust.json keybindings.json)

if [ "$CHECK" -eq 1 ]; then
  echo "=== Drift check (read-only): anything sync would overwrite or delete fails the check ==="
  rc=0
  for pair in "${PAIRS[@]}"; do
    name="${pair%%:*}"; src="${pair#*:}"; dst="$DST/$name"
    out=$(rsync -ainc --delete "${EX[@]}" "$src/" "$dst/" 2>/dev/null | grep -E '^(\*deleting|>)' || true)
    if [ -z "$out" ]; then
      echo "  ✅ $name: no drift"
    else
      echo "  ⚠  $name:"
      echo "$out" | sed 's/^/       /'
      rc=1
    fi
  done

  for f in "${FILES[@]}"; do
    src="$SRC/$f"; dst="$DST/$f"
    if [ ! -f "$src" ] && [ ! -f "$dst" ]; then
      echo "  ✅ $f: absent on both sides"
      continue
    fi
    if cmp -s "$src" "$dst" 2>/dev/null; then
      echo "  ✅ $f: no drift"
    else
      echo "  ⚠  $f: repository and runtime differ"
      rc=1
    fi
  done

  noted=()
  for f in "${MIRRORS[@]}"; do
    src="$SRC/$f"; dst="$DST/$f"
    [ -f "$src" ] && [ -f "$dst" ] || continue
    cmp -s "$src" "$dst" || noted+=("$f")
  done
  if [ ${#noted[@]} -gt 0 ]; then
    echo "  note: runtime-owned files differ from the repository mirror (expected, not a failure):"
    printf '       %s\n' "${noted[@]}"
  fi

  # bin/ is runtime-owned, so this is a note: the repository keeps a versioned copy of the
  # scripts and the two can legitimately differ until someone copies one over the other.
  script_drift=()
  for f in "$REPO_DIR/scripts"/*; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    [ -f "$ROOT/bin/$name" ] || continue
    cmp -s "$f" "$ROOT/bin/$name" || script_drift+=("$name")
  done
  if [ ${#script_drift[@]} -gt 0 ]; then
    echo "  note: bin/ copies differ from scripts/: ${script_drift[*]}"
    echo "        repository: $REPO_DIR/scripts   runtime: $ROOT/bin"
  fi

  [ $rc -eq 0 ] && echo "✅ No drift" || echo "🔴 Drift found — capture runtime changes back to the repository first, or confirm before syncing"
  exit $rc
fi

echo "=== Syncing repositories → $DST ==="
for pair in "${PAIRS[@]}"; do
  name="${pair%%:*}"; src="${pair#*:}"; dst="$DST/$name"
  rsync -a --delete "${EX[@]}" "$src/" "$dst/"
  echo "  ✔ $name"
done

for f in "${FILES[@]}"; do
  if [ -f "$SRC/$f" ]; then
    cp "$SRC/$f" "$DST/$f"
    echo "  ✔ $f"
  fi
done
echo "Done."
