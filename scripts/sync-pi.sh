#!/bin/bash
# sync-pi.sh — sync the configuration repositories (pi-setup / agent-setup) into the
# Linux Pi agent directory.
#
# Usage:
#   bash ~/pi/bin/sync-pi.sh            apply the sync
#   bash ~/pi/bin/sync-pi.sh --check    report drift only; change nothing
#
# `--delete` semantics and the exclude list match the retired Windows copy; only the
# paths point at ~/pi now.
set -euo pipefail

REPOS="$HOME/pi/repos"
SRC="$REPOS/pi-setup/agent"
SRC_SKILLS="$REPOS/agent-setup/skills"
DST="$HOME/pi/agent"

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

if [[ "${1:-}" == "--check" || "${1:-}" == "-n" ]]; then
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
  [ $rc -eq 0 ] && echo "✅ No drift" || echo "🔴 Drift found — capture runtime changes back to the repository first, or confirm before syncing"
  exit $rc
fi

echo "=== Syncing repositories → $DST ==="
for pair in "${PAIRS[@]}"; do
  name="${pair%%:*}"; src="${pair#*:}"; dst="$DST/$name"
  rsync -a --delete "${EX[@]}" "$src/" "$dst/"
  echo "  ✔ $name"
done
echo "Done."
