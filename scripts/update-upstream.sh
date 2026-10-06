#!/usr/bin/env bash
# Fetch upstream changes. Review and merge with Git/Lazygit; never commit or deploy here.
set -euo pipefail

case "${1:-}" in
  --help|-h)
    echo "Usage: update-upstream.sh"
    echo "Fetch both upstream branches; review, merge, commit, and deploy separately."
    exit 0
    ;;
  "") ;;
  *) echo "Usage: update-upstream.sh" >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || { echo "Too many arguments" >&2; exit 2; }
ROOT="${PI_ROOT:-$HOME/pi}"

for name in pi-setup agent-setup; do
  repo="$ROOT/repos/$name"
  [ -d "$repo" ] || { echo "Missing repository: $repo" >&2; exit 1; }
  git -C "$repo" rev-parse --git-dir >/dev/null
  git -C "$repo" fetch upstream main
  echo "=== $name ==="
  git -C "$repo" status --short --branch
  echo "Upstream commits not yet merged: $(git -C "$repo" rev-list --count HEAD..upstream/main)"
  printf 'Review in Lazygit: lazygit -p %q\n' "$repo"
  printf 'Merge when ready: git -C %q merge --no-commit --no-ff upstream/main\n' "$repo"
done

echo "Fetch complete. Existing working files were not replaced."
echo "Resolve conflicts and review local choices before committing; nothing was pushed."
echo "Preview deployment: ~/pi/bin/sync-pi.sh --check"
echo "Apply reviewed Pi configuration: ~/pi/bin/sync-pi.sh --apply"
echo "Update the native Skills worktree from your local agent-setup commit separately."
