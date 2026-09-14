#!/usr/bin/env bash
# update-pi.sh — update the Linux Pi installation and run non-destructive checks afterwards.
#
# Usage:
#   ~/pi/bin/update-pi.sh --check  # read-only checks; no network, no changes
#   ~/pi/bin/update-pi.sh          # update the Pi package
#
# Configuration repositories are not pulled automatically: pi-setup may hold local
# changes that need a manual decision first.
set -euo pipefail

ROOT="${PI_ROOT:-$HOME/pi}"
NODE="$ROOT/node/bin/node"
NPM="$ROOT/node/bin/npm"
APP="$ROOT/app"
BACKUPS="$ROOT/backups"
REQ_NODE="22.19.0"

version_ge() {
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$2" ]
}

if [ ! -x "$NODE" ] || [ ! -x "$NPM" ]; then
  echo "❌ Missing Linux Node/npm: $NODE / $NPM" >&2
  exit 1
fi

NODE_VER="$($NODE --version | sed 's/^v//')"
if ! version_ge "$NODE_VER" "$REQ_NODE"; then
  echo "❌ Node v$NODE_VER is below the required v$REQ_NODE" >&2
  exit 1
fi
echo "Node: v$NODE_VER"

case "${1:-}" in
  --check)
    "$ROOT/bin/pi" --version
    echo "=== Repository status (read-only) ==="
    for repo in "$ROOT/repos/pi-setup" "$ROOT/repos/agent-setup"; do
      if [ -d "$repo/.git" ]; then
        echo "-- $repo"
        git -C "$repo" status --short --branch
      else
        echo "⚠️  Repository missing: $repo"
      fi
    done
    if [ -x "$ROOT/bin/verify-pi.sh" ]; then
      "$ROOT/bin/verify-pi.sh"
    fi
    exit 0
    ;;
  "") ;;
  *) echo "Usage: $0 [--check]" >&2; exit 2 ;;
esac

[ -d "$APP" ] || { echo "❌ Pi application directory missing: $APP" >&2; exit 1; }
mkdir -p "$BACKUPS"
STAMP="$(date +%Y%m%d-%H%M%S)"
META_BACKUP="$BACKUPS/pi-app-metadata-$STAMP.tar.gz"

tar -czf "$META_BACKUP" -C "$APP" package.json package-lock.json
chmod 600 "$META_BACKUP"
echo "Backed up package metadata: $META_BACKUP"

before="$($ROOT/bin/pi --version 2>/dev/null || true)"
echo "Current version: ${before:-unknown}"

echo "=== Updating the Linux Pi installation ==="
(
  cd "$APP"
  "$NPM" install --save-exact "@earendil-works/pi-coding-agent@latest"
)

after="$($ROOT/bin/pi --version 2>/dev/null || true)"
if [ -z "$after" ]; then
  echo "❌ Pi failed to start after the update; restoring package metadata and reinstalling the previous version" >&2
  tar -xzf "$META_BACKUP" -C "$APP"
  (cd "$APP" && "$NPM" ci)
  exit 1
fi

echo "Updated version: $after"
if [ -x "$ROOT/bin/verify-pi.sh" ]; then
  "$ROOT/bin/verify-pi.sh"
fi

echo "✅ Pi update finished; repositories were not pulled automatically — review git status before syncing."
