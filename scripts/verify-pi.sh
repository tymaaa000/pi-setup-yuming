#!/usr/bin/env bash
# Minimal Pi runtime check. Hardware, QMD, and repository drift are separate concerns.
# Never prints credential contents; only checks auth.json permissions when present.
set -u -o pipefail
umask 077

usage() { echo "Usage: verify-pi.sh [--help]"; }
[ "$#" -le 1 ] || { usage >&2; exit 2; }
case "${1:-}" in
  "") ;;
  --help|-h) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

ROOT="${PI_ROOT:-$HOME/pi}"
AGENT="${PI_CODING_AGENT_DIR:-$ROOT/agent}"
NODE="$HOME/.local/opt/node/bin/node"
failures=0
ok() { printf '✅ %s\n' "$*"; }
bad() { printf '❌ %s\n' "$*"; failures=$((failures + 1)); }
warn() { printf '⚠️  %s\n' "$*"; }

printf '=== Pi runtime check ===\n'
if [ -x "$NODE" ]; then
  if platform="$("$NODE" -p 'process.platform' 2>/dev/null)" && [ "$platform" = linux ]; then
    ok "Linux Node available"
  else
    bad "Linux Node unavailable"
  fi
else
  bad "Missing Linux Node: $NODE"
fi

if [ -x "$ROOT/bin/pi" ]; then
  if version="$("$ROOT/bin/pi" --version 2>/dev/null)" && [ -n "$version" ]; then
    ok "Pi launcher works ($version)"
  else
    bad "Pi launcher version check failed"
  fi
  # Let Pi load its own configuration and extensions; do not duplicate its validators.
  if startup_log="$(mktemp "${TMPDIR:-/tmp}/pi-startup-check.XXXXXX")"; then
    if "$ROOT/bin/pi" --offline --mode rpc --no-session </dev/null >"$startup_log" 2>&1; then
      ok "Pi offline startup works"
      rm -f "$startup_log"
    else
      bad "Pi startup failed; diagnostics retained at $startup_log"
    fi
  else
    bad "Cannot create a private startup diagnostic log"
  fi
else
  bad "Missing Pi launcher: $ROOT/bin/pi"
fi

if [ -f "$AGENT/auth.json" ]; then
  mode="$(stat -c '%a' "$AGENT/auth.json" 2>/dev/null || true)"
  [ "$mode" = 600 ] && ok "auth.json permissions are 600" || bad "auth.json permissions should be 600 (currently $mode)"
else
  warn "auth.json absent; another authentication method may be in use"
fi

if [ "$failures" -eq 0 ]; then
  printf '\n✅ Pi runtime check passed\n'
else
  printf '\n❌ Pi runtime check found %d failure(s)\n' "$failures"
fi
exit "$failures"
