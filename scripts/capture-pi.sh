#!/bin/bash
# capture-pi.sh
# 把 .pi/agent 里的改动「反向」抓回 pi-setup / agent-setup 仓库。
#
# 为什么需要它：sync-pi.sh 是单向的（仓库 → 运行时），而且对 extensions/ agents/
# prompts/ skills/ 使用了 rsync --delete。任何只存在于运行时的文件，下一次同步就会
# 被静默删掉。本脚本提供缺失的反方向，让"运行时改的东西"能落回仓库。
#
# 用法:
#   bash capture-pi.sh            # 抓取（不删除仓库文件）
#   bash capture-pi.sh --check    # 只报告差异，不写入
#
# 之后请自行在仓库里 git commit / push。

set -euo pipefail

BASE="/mnt/d/Program Files/piagent"
SRC="$BASE/pi-setup/agent"
SRC_SKILLS="$BASE/agent-setup/skills"
DST="$BASE/.pi/agent"

for d in "$BASE" "$SRC" "$DST" "$SRC_SKILLS"; do
  if [ ! -d "$d" ]; then
    echo "❌ 目录不存在: $d — 终止" >&2
    exit 1
  fi
done

CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

# 运行时状态 / 依赖，绝不回写仓库
EX=(--exclude=node_modules --exclude=__pycache__ --exclude=last_model.json
    --exclude=.DS_Store)

RSYNC_OPTS=(-a -c --itemize-changes)
[ "$CHECK" -eq 1 ] && RSYNC_OPTS+=(--dry-run)

echo "=== capture: .pi/agent → 仓库 $([ "$CHECK" -eq 1 ] && echo '（预演，不写入）') ==="
rc=0
cap_tree() {
  local name="$1" src="$2" dst="$3" out
  # 不带 --delete：捕获只做新增/更新，永不删除仓库文件
  out=$(rsync "${RSYNC_OPTS[@]}" "${EX[@]}" "$src/" "$dst/" 2>/dev/null \
        | grep -E '^>f' || true)
  if [ -z "$out" ]; then
    echo "  ✅ $name 已对齐"
  else
    echo "  ⚠  $name 有改动："
    echo "$out" | sed 's/^/       /'
    rc=1
  fi
}

cap_file() {
  local name="$1" src="$2" dst="$3"
  if diff -q "$src" "$dst" >/dev/null 2>&1; then
    echo "  ✅ $name 已对齐"
  else
    echo "  ⚠  $name 需要回写"
    [ "$CHECK" -eq 0 ] && cp "$src" "$dst"
    rc=1
  fi
}

cap_tree "extensions" "$DST/extensions" "$SRC/extensions"
cap_tree "agents"     "$DST/agents"     "$SRC/agents"
cap_tree "prompts"    "$DST/prompts"    "$SRC/prompts"
cap_tree "skills"     "$DST/skills"     "$SRC_SKILLS"
cap_file "APPEND_SYSTEM.md"      "$DST/APPEND_SYSTEM.md"      "$SRC/APPEND_SYSTEM.md"
cap_file "web-tools-config.json" "$DST/web-tools-config.json" "$SRC/web-tools-config.json"
cap_file "AGENTS.md"             "$DST/AGENTS.md"             "$SRC/AGENTS.md"
cap_file "pi-websearch.json"     "$DST/pi-websearch.json"     "$SRC/pi-websearch.json"

# 管理脚本：运行目录 → 仓库 scripts/
for s in sync-pi.sh sync-pi-safely.sh capture-pi.sh update-pi.sh; do
  run_script="$BASE/$s"
  repo_script="$BASE/pi-setup/scripts/$s"
  [ -f "$run_script" ] || continue
  if [ -f "$repo_script" ] && diff -q "$run_script" "$repo_script" >/dev/null 2>&1; then
    echo "  ✅ scripts/$s 已对齐"
  else
    echo "  ⚠  scripts/$s 需要回写"
    [ "$CHECK" -eq 0 ] && cp "$run_script" "$repo_script"
    rc=1
  fi
done

echo ""
if [ "$rc" -eq 0 ]; then
  echo "✅ 无需捕获——运行时与仓库一致"
else
  if [ "$CHECK" -eq 1 ]; then
    echo "⚠  以上内容需要 capture（去掉 --check 实际写入）"
  else
    echo "✅ 捕获完成。下一步在仓库里提交："
    echo "   git -C \"$BASE/pi-setup\" status --short"
    echo "   git -C \"$BASE/agent-setup\" status --short"
  fi
fi
exit "$rc"
