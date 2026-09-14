#!/bin/bash
# capture-pi.sh — copy runtime edits from the Linux Pi agent directory back into the
# configuration repositories.
#
# Usage:
#   bash ~/pi/bin/capture-pi.sh            apply the capture
#   bash ~/pi/bin/capture-pi.sh --check    report differences only
#   bash ~/pi/bin/capture-pi.sh --prune    also delete repository-only files (with care)
#
# Edits made directly in the runtime directory (for example a quick extension patch) are
# deleted by the next `sync-pi.sh --delete`, so capture them back before syncing. Review
# and commit the result in the repository afterwards.
set -euo pipefail

REPOS="$HOME/pi/repos"
DST="$REPOS/pi-setup/agent"
DST_SKILLS="$REPOS/agent-setup/skills"
SRC="$HOME/pi/agent"

for d in "$REPOS" "$SRC"; do
  [ -d "$d" ] || { echo "❌ Missing directory: $d — aborting" >&2; exit 1; }
done

# Excludes must match sync-pi.sh: runtime-generated package settings stay local.
EX=(--exclude=node_modules --exclude=__pycache__ --exclude=last_model.json --exclude=eko24ive-pi-ask.json)
PRUNE=0

case "${1:-}" in
  "" ) ;;
  --prune) PRUNE=1 ;;
  --check|-n) ;;
  *) echo "Usage: $0 [--check|--prune]" >&2; exit 2 ;;
esac

PAIRS=(
  "extensions:$SRC/extensions:$DST/extensions"
  "agents:$SRC/agents:$DST/agents"
  "prompts:$SRC/prompts:$DST/prompts"
  "skills:$SRC/skills:$DST_SKILLS"
)

if [[ "${1:-}" == "--check" || "${1:-}" == "-n" ]]; then
  echo "=== Runtime-only or modified items not yet in the repositories ==="
  rc=0
  for pair in "${PAIRS[@]}"; do
    IFS=: read -r name src dst <<< "$pair"
    out=$(rsync -ainc --delete "${EX[@]}" "$src/" "$dst/" 2>/dev/null | grep -E '^(\*deleting|>)' || true)
    if [ -z "$out" ]; then
      echo "  ✅ $name: in sync"
    else
      echo "  ⚠  $name:"
      echo "$out" | sed 's/^/       /'
      rc=1
    fi
  done
  exit "$rc"
fi

echo "=== Capturing runtime → repositories ==="
for pair in "${PAIRS[@]}"; do
  IFS=: read -r name src dst <<< "$pair"
  if [ "$PRUNE" -eq 1 ]; then
    rsync -a --delete "${EX[@]}" "$src/" "$dst/"
  else
    # Repository-only files are never deleted unless --prune is passed explicitly.
    rsync -a "${EX[@]}" "$src/" "$dst/"
  fi
  echo "  ✔ $name"
done
echo "Done. Next: cd \"$REPOS/pi-setup\" && git status && git diff"
if [ "$PRUNE" -eq 0 ]; then
  echo "Note: repository-only files were kept; use --prune to remove them explicitly."
fi
