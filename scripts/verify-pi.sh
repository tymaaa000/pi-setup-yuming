#!/usr/bin/env bash
# verify-pi.sh — non-destructive health check for the Linux Pi setup.
# Never reads or prints auth.json contents; it only checks paths, permissions,
# dependencies, and local service status.
set -u -o pipefail

ROOT="${PI_ROOT:-$HOME/pi}"
AGENT="${PI_CODING_AGENT_DIR:-$ROOT/agent}"
failures=0

ok()   { printf '✅ %s\n' "$*"; }
bad()  { printf '❌ %s\n' "$*"; failures=$((failures + 1)); }
warn() { printf '⚠️  %s\n' "$*"; }

printf '=== Linux Pi health check ===\n'
printf 'root:  %s\nagent: %s\n\n' "$ROOT" "$AGENT"

if [ -x "$ROOT/bin/pi" ]; then
  version="$($ROOT/bin/pi --version 2>/dev/null || true)"
  [ -n "$version" ] && ok "pi launcher works ($version)" || bad "pi launcher returned no version"
else
  bad "Missing executable launcher: $ROOT/bin/pi"
fi

if [ -x "$ROOT/node/bin/node" ]; then
  platform="$($ROOT/node/bin/node -p 'process.platform' 2>/dev/null || true)"
  node_version="$($ROOT/node/bin/node --version 2>/dev/null || true)"
  [ "$platform" = linux ] && ok "Linux Node available ($node_version)" || bad "Unexpected Node platform: $platform"
else
  bad "Missing Linux Node: $ROOT/node/bin/node"
fi

for cmd in bash git rsync python3 nvim yazi lazygit rg fd xdg-open notify-send qmd; do
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "Command available: $cmd"
  else
    bad "Command missing: $cmd"
  fi
done

if python3 - "$AGENT" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
files = [
    "settings.json", "models.json", "models-store.json", "pi-lsp.json",
    "pi-websearch.json", "subagent-model.json", "trust.json",
]
for name in files:
    json.loads((root / name).read_text(encoding="utf-8"))
json.loads((root / "auth.json").read_text(encoding="utf-8"))
PY
then
  ok "Runtime JSON configuration parses"
else
  bad "Runtime JSON configuration failed to parse"
fi

if [ -f "$AGENT/auth.json" ]; then
  mode="$(stat -c '%a' "$AGENT/auth.json" 2>/dev/null || true)"
  [ "$mode" = 600 ] && ok "auth.json permissions are 600" || bad "auth.json should be 600 (currently $mode)"
else
  warn "auth.json not found (another authentication method may be in use)"
fi

if bash "$ROOT/bin/sync-pi.sh" --check >/tmp/pi-sync-check.$$.log 2>&1; then
  ok "No drift between repositories and runtime"
else
  bad "Drift between repositories and runtime; see /tmp/pi-sync-check.$$.log"
fi
rm -f "/tmp/pi-sync-check.$$.log"

if [ -x "$ROOT/bin/capture-pi.sh" ]; then
  ok "capture-pi.sh is executable"
else
  bad "capture-pi.sh missing or not executable"
fi

if [ -d "$HOME/.cache/qmd" ] && [ -f "$HOME/.cache/qmd/index.sqlite" ]; then
  ok "qmd local index exists"
  if qmd_status="$(qmd status 2>&1)"; then
    # qmd omits the Orphaned line entirely when there is nothing to clean up.
    orphan_line="$(printf '%s\n' "$qmd_status" | grep -m1 'Orphaned:' || true)"
    if [ -z "$orphan_line" ]; then
      ok "qmd has no orphaned embedding chunks"
    elif printf '%s\n' "$orphan_line" | grep -qE 'Orphaned:[[:space:]]*0([^0-9]|$)'; then
      ok "qmd has no orphaned embedding chunks"
    else
      bad "qmd has orphaned embedding chunks: $orphan_line"
    fi
  else
    bad "qmd status failed: $(printf '%s\n' "$qmd_status" | head -1)"
  fi
  for model in \
    "$HOME/.cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf" \
    "$HOME/.cache/qmd/models/hf_tobil_qmd-query-expansion-1.7B-q4_k_m.gguf" \
    "$HOME/.cache/qmd/models/hf_ggml-org_qwen3-reranker-0.6b-q8_0.gguf"; do
    if [ -s "$model" ] && [ ! -e "${model}.ipull" ]; then
      ok "qmd model complete: $(basename "$model")"
    else
      bad "qmd model incomplete or still downloading: $model"
    fi
  done
else
  bad "qmd local index missing: $HOME/.cache/qmd/index.sqlite"
fi

if [ -e /dev/serial/by-id/usb-1a86_USB_Serial-if00-port0 ]; then
  ok "Stable USB serial path exists"
else
  bad "Stable USB serial path missing (check usbipd attach)"
fi
if id -nG | tr ' ' '\n' | grep -qx dialout; then
  ok "Current user is in the dialout group"
else
  bad "Current user is not in the dialout group"
fi

for path in \
  /usr/local/arm/gcc-linaro-4.9.4-2017.01-x86_64_arm-linux-gnueabihf/bin/arm-linux-gnueabihf-gcc \
  /home/tym/linux/nfs/rootfs/lib/modules/4.1.15+ \
  /mnt/d/tools/tftp; do
  [ -e "$path" ] && ok "Path exists: $path" || bad "Path missing: $path"
done

if [ -f /mnt/d/Linux/searxng-manage.sh ]; then
  if curl -fsS -o /dev/null --max-time 30 'http://localhost:8888/search?q=t&format=json'; then
    ok "SearXNG HTTP endpoint responds"
  else
    bad "SearXNG HTTP endpoint unavailable"
  fi
else
  bad "SearXNG management script missing"
fi

if [ -f /mnt/d/Linux/Code/Linux_Drivers/pi-config.toml ]; then
  ok "Driver project Linux configuration exists"
  if python3 -c 'import serial' 2>/dev/null; then
    ok "Python pyserial available"
  else
    bad "Python is missing pyserial"
  fi
else
  warn "Driver project configuration not found; skipping hardware project checks"
fi

if [ -d "$ROOT/backups" ]; then
  for backup in "$ROOT/backups"/*.tar.gz; do
    [ -e "$backup" ] || continue
    mode="$(stat -c '%a' "$backup" 2>/dev/null || true)"
    [ "$mode" = 600 ] && ok "Backup permissions are safe: $(basename "$backup")" || warn "Backup permissions are not 600: $backup"
  done
fi

if [ -d "$ROOT/repos/pi-setup" ] && [ -n "$(git -C "$ROOT/repos/pi-setup" status --porcelain 2>/dev/null)" ]; then
  warn "pi-setup has uncommitted changes; review before updating"
fi
if [ -d "/mnt/d/Program Files/piagent" ]; then
  warn "Windows rollback directory still exists; use $ROOT/bin/pi for daily work"
fi

if [ "$failures" -eq 0 ]; then
  printf '\n✅ Health check passed\n'
else
  printf '\n❌ Health check found %d failure(s)\n' "$failures"
fi
exit "$failures"
