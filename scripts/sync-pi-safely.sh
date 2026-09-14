#!/bin/bash
# sync-pi-safely.sh — sync with a safety net.
# Usage: bash ~/pi/bin/sync-pi-safely.sh
#
# Differences from running sync-pi.sh directly:
#   1. Runs `sync-pi.sh --check` first; if runtime-only files would be deleted,
#      it aborts and asks you to capture them back into the repository first.
#   2. After syncing, verifies that sessions/ and the launcher survived.
set -euo pipefail

ROOT="${PI_ROOT:-$HOME/pi}"
AGENT="$ROOT/agent"
SESSIONS="$AGENT/sessions"

echo "=== 1/3 Drift pre-check (read-only) ==="
if ! bash "$ROOT/bin/sync-pi.sh" --check; then
  echo ""
  echo "🛑 Aborted: the files listed above would be deleted by the sync." >&2
  echo "   Run first: bash \"$ROOT/bin/capture-pi.sh\"" >&2
  echo "   Then run this script again." >&2
  exit 1
fi

SESSIONS_BEFORE=$(find "$SESSIONS" -name "*.jsonl" 2>/dev/null | wc -l)

echo ""
echo "=== 2/3 Applying sync ==="
bash "$ROOT/bin/sync-pi.sh"

echo ""
echo "=== 3/3 Safety check ==="
SESSIONS_AFTER=$(find "$SESSIONS" -name "*.jsonl" 2>/dev/null | wc -l)

[ -d "$SESSIONS" ] && echo "✅ sessions/ exists" || { echo "❌ sessions/ was deleted — stop immediately!" >&2; exit 1; }
[ -x "$ROOT/bin/pi" ] && echo "✅ launcher exists" || { echo "❌ launcher missing!" >&2; exit 1; }
if [ "$SESSIONS_BEFORE" -eq "$SESSIONS_AFTER" ]; then
  echo "✅ Session files unchanged ($SESSIONS_BEFORE)"
else
  echo "⚠ Session file count changed: $SESSIONS_BEFORE → $SESSIONS_AFTER"
fi
