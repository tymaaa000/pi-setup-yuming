#!/bin/bash
# sync-pi-safely.sh — 带保险的同步脚本
# 用法: bash sync-pi-safely.sh
#
# 与直接跑 sync-pi.sh 的区别：
#   1. 先跑 `sync-pi.sh --check`；若检测到运行时独有的文件（同步会删掉它们），
#      直接中止并提示用 capture-pi.sh 先抓回仓库。
#   2. 同步后校验 sessions/ 与 bin/ 未被破坏。
#
# 路径风格与 sync-pi.sh 保持一致（WSL /mnt/d/...），不要再改回 D:/... —
# 那会让本脚本在 WSL 下直接失败（find/cp 找不到路径）。

set -euo pipefail

BASE="/mnt/d/Program Files/piagent"
SESSIONS="$BASE/.pi/agent/sessions"
BIN="$BASE/.pi/agent/bin"

echo "=== 1/3 漂移预检（只读）==="
if ! bash "$BASE/sync-pi.sh" --check; then
  echo ""
  echo "🛑 中止：上面的 🔴 文件会在同步时被删除。" >&2
  echo "   先运行: bash \"$BASE/capture-pi.sh\"" >&2
  echo "   然后再运行本脚本。" >&2
  exit 1
fi

SESSIONS_BEFORE=$(find "$SESSIONS" -name "*.jsonl" 2>/dev/null | wc -l)

echo ""
echo "=== 2/3 执行同步 ==="
bash "$BASE/sync-pi.sh"

echo ""
echo "=== 3/3 安全检查 ==="
SESSIONS_AFTER=$(find "$SESSIONS" -name "*.jsonl" 2>/dev/null | wc -l)

[ -d "$SESSIONS" ] && echo "✅ sessions/ 存在" || { echo "❌ sessions/ 被删除！立即停止！" >&2; exit 1; }
[ -d "$BIN" ] && echo "✅ bin/ 存在" || { echo "❌ bin/ 被删除！" >&2; exit 1; }
if [ "$SESSIONS_BEFORE" -eq "$SESSIONS_AFTER" ]; then
  echo "✅ 会话文件 $SESSIONS_BEFORE 个未丢失"
else
  echo "⚠ 会话文件数变化: $SESSIONS_BEFORE → $SESSIONS_AFTER"
fi
