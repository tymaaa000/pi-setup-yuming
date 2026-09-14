#!/bin/bash
# test-all.sh — run every extension unit test with the same TypeScript loader pi uses.
#
# Usage:
#   bash scripts/test-all.sh              run every test under agent/extensions
#   bash scripts/test-all.sh <path>...    run only the given files/directories
#   bash scripts/test-all.sh --list       list the test files that would run
#
# pi loads .ts extensions with jiti, so extensions may use either "./x.ts" or "./x.js"
# import specifiers. Plain `node --test` cannot resolve the ".js → .ts" form, which is
# why several packages used to depend on tsx. This script reuses pi's own jiti, so no
# extra dependency is needed.
set -euo pipefail

ROOT="${PI_ROOT:-$HOME/pi}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$ROOT/node/bin/node"
[ -x "$NODE" ] || NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "❌ node not found" >&2; exit 1; }

find_jiti() {
  local candidates=(
    "$ROOT/app/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti-register.mjs"
    "$ROOT/app/node_modules/jiti/lib/jiti-register.mjs"
  )
  local c
  for c in "${candidates[@]}"; do
    [ -f "$c" ] && { printf '%s' "$c"; return; }
  done
  # Fallback: locate jiti wherever the installed pi bundles it.
  find "$ROOT/app/node_modules" -maxdepth 8 -type f \
    -path '*/jiti/lib/jiti-register.mjs' 2>/dev/null | head -1 || true
}

JITI="$(find_jiti)"

LIST_ONLY=0
TARGETS=()
for arg in "$@"; do
  case "$arg" in
    --list|-l) LIST_ONLY=1 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) TARGETS+=("$arg") ;;
  esac
done

if [ ${#TARGETS[@]} -eq 0 ]; then
  TARGETS=("$REPO/agent/extensions")
fi

FILES=()
for t in "${TARGETS[@]}"; do
  if [ -d "$t" ]; then
    while IFS= read -r f; do FILES+=("$f"); done < <(find "$t" -name '*.test.ts' -not -path '*/node_modules/*' | sort)
  elif [ -f "$t" ]; then
    FILES+=("$t")
  else
    echo "⚠  Skipping missing path: $t" >&2
  fi
done

if [ ${#FILES[@]} -eq 0 ]; then
  echo "❌ No test files found" >&2
  exit 1
fi

if [ "$LIST_ONLY" -eq 1 ]; then
  printf '%s\n' "${FILES[@]}"
  echo "--- ${#FILES[@]} test files ---"
  exit 0
fi

echo "=== Extension tests (${#FILES[@]} files) ==="
if [ -n "$JITI" ]; then
  echo "loader: $JITI"
  set +e
  "$NODE" --import "$JITI" --test "${FILES[@]}"
  rc=$?
  set -e
else
  echo "⚠  jiti not found under $ROOT/app/node_modules — falling back to plain node --test";
  echo "   Tests that import \"./x.js\" will fail in this mode."
  set +e
  "$NODE" --test "${FILES[@]}"
  rc=$?
  set -e
fi

if [ "$rc" -eq 0 ]; then
  echo "✅ All extension tests passed"
else
  echo "🔴 Extension tests failed (exit $rc)" >&2
fi
exit "$rc"
