#!/bin/bash
# sync-pi.sh
# 将 pi-setup 和 agent-setup 的更新同步到 pi 的运行时目录
# 用法: bash sync-pi.sh

set -euo pipefail

BASE="/mnt/d/Program Files/piagent"
SRC="$BASE/pi-setup/agent"
SRC_SKILLS="$BASE/agent-setup/skills"
DST="$BASE/.pi/agent"

# Safety: verify critical directories exist
for d in "$BASE" "$SRC" "$DST"; do
  if [ ! -d "$d" ]; then
    echo "❌ 目录不存在: $d — 终止" >&2
    exit 1
  fi
done

echo "=== 同步 pi-setup → .pi/agent ==="

# ── --check / -n: 只报告漂移，绝不修改任何文件 ──
# 危险的是 `*deleting`：运行时新增、仓库里没有的文件，同步时会被 rsync --delete 删掉。
if [[ "${1:-}" == "--check" || "${1:-}" == "-n" ]]; then
  EX=(--exclude=node_modules --exclude=__pycache__ --exclude=last_model.json)
  rc=0
  echo "漂移检查（只读）—— '>' 会被覆盖，'*deleting' 会被删除"
  check_tree() {
    local name="$1" src="$2" dst="$3" out
    out=$(rsync -ainc --delete "${EX[@]}" "$src/" "$dst/" 2>/dev/null | grep -E '^(\*deleting|>)' || true)
    if [ -z "$out" ]; then
      echo "  ✅ $name 无漂移"
      return
    fi
    echo "  ⚠  $name："
    echo "$out" | sed 's/^/       /'
    if echo "$out" | grep -q '^\*deleting'; then
      echo "       🔴 上面的 *deleting 文件同步时会被删除——先把它们 capture 回仓库或备份"
      rc=1
    fi
  }
  check_file() {
    local name="$1" src="$2" dst="$3"
    if diff -q "$src" "$dst" >/dev/null 2>&1; then
      echo "  ✅ $name 无漂移"
    else
      echo "  ⚠  $name：运行时会覆盖仓库版本"
      rc=1
    fi
  }
  check_tree "extensions" "$SRC/extensions" "$DST/extensions"
  check_tree "agents"     "$SRC/agents"     "$DST/agents"
  check_tree "prompts"    "$SRC/prompts"    "$DST/prompts"
  check_tree "skills"     "$SRC_SKILLS"     "$DST/skills"
  check_file "APPEND_SYSTEM.md"      "$SRC/APPEND_SYSTEM.md"      "$DST/APPEND_SYSTEM.md"
  check_file "web-tools-config.json" "$SRC/web-tools-config.json" "$DST/web-tools-config.json"
  # 管理脚本的版本化副本（仓库 scripts/ ↔ 运行目录）
  for s in sync-pi.sh sync-pi-safely.sh capture-pi.sh update-pi.sh; do
    repo_script="$BASE/pi-setup/scripts/$s"
    run_script="$BASE/$s"
    [ -f "$repo_script" ] || continue
    if diff -q "$repo_script" "$run_script" >/dev/null 2>&1; then
      echo "  ✅ scripts/$s 无漂移"
    else
      echo "  ⚠  scripts/$s 与运行目录不一致（跑 capture-pi.sh 回写）"
      rc=1
    fi
  done
  echo ""
  if [ "$rc" -eq 0 ]; then
    echo "✅ 无漂移——同步将是幂等的"
  else
    echo "🔴 存在漂移，直接跑 sync-pi.sh 可能丢东西。先跑 capture-pi.sh。"
  fi
  exit "$rc"
fi

# 要跳过的文件（你的配置 + 运行时自动生成的，不覆盖不删除）
# ⚠ sessions/ bin/ git/ npm/ searxng-instances/ 是运行时目录，
#    永远不要用 rsync --delete 或 rm -rf 清理它们
SKIP=(
  "settings.json"
  "pi-websearch.json"
  "auth.json"
  "trust.json"
  "models-store.json"
  "sessions"
  "bin"
  "git"
  "npm"
  "searxng-instances"
)

# ⚠ 必须排除：这些只存在于运行时，仓库里没有，没有排除项时 `rsync --delete`
#    会把它们删掉。曾经因此删掉了 extensions/subagent-model/node_modules
#    （为跑测试装的依赖），而 extensions/web-tools/node_modules 因为恰好
#    在仓库里躺着一份副本而幸免——同一件事两个结果，纯属侥幸。
EXCLUDES=(
  --exclude=node_modules
  --exclude=__pycache__
  --exclude=last_model.json
  --exclude=.DS_Store
)

# 同步 extensions/
echo "--- extensions ---"
rsync -av --delete "${EXCLUDES[@]}" "$SRC/extensions/" "$DST/extensions/" 2>/dev/null || \
  cp -r "$SRC/extensions/"* "$DST/extensions/"

# 同步 agents/
echo "--- agents ---"
rsync -av --delete "${EXCLUDES[@]}" "$SRC/agents/" "$DST/agents/" 2>/dev/null || \
  cp -r "$SRC/agents/"* "$DST/agents/"

# 同步 prompts/
echo "--- prompts ---"
rsync -av --delete "${EXCLUDES[@]}" "$SRC/prompts/" "$DST/prompts/" 2>/dev/null || \
  cp -r "$SRC/prompts/"* "$DST/prompts/"

# 同步 APPEND_SYSTEM.md
echo "--- APPEND_SYSTEM.md ---"
cp "$SRC/APPEND_SYSTEM.md" "$DST/APPEND_SYSTEM.md"

# 同步 web-tools 配置（独立于用户 settings.json）
echo "--- web-tools-config.json ---"
cp "$SRC/web-tools-config.json" "$DST/web-tools-config.json"

# 同步 agent-setup skills/
echo "--- skills (from agent-setup) ---"
rsync -av --delete "${EXCLUDES[@]}" "$SRC_SKILLS/" "$DST/skills/" 2>/dev/null || \
  cp -r "$SRC_SKILLS/"* "$DST/skills/"

# 检查 settings.json 是否有新增的 packages（提醒但不覆盖）
echo ""
echo "=== 请手动检查以下文件是否有新内容 ==="
for f in "${SKIP[@]}"; do
  if [ -f "$SRC/$f" ] && [ -f "$DST/$f" ]; then
    if ! diff -q "$SRC/$f" "$DST/$f" > /dev/null 2>&1; then
      echo "⚠ $f — pi-setup 版本有变化，请手动对比："
      echo "  diff \"$SRC/$f\" \"$DST/$f\""
    fi
  fi
done

echo ""
echo "=== 同步完成，重启 pi 生效 ==="
