#!/bin/bash
# update-pi.sh — pi 一键更新（程序本体 + 配置/skills 同步）
# 用法: bash update-pi.sh
#
# 背景：本安装是「本地 npm 项目 + git 配置仓库」结构，`pi update` 无法自更新
#（会提示 not managed by a global npm install）。此脚本封装完整更新流程：
#   1. npm 更新 pi 程序本体到最新
#   2. git 拉取 pi-setup / agent-setup 配置仓库
#   3. 同步配置到 .pi/agent（复用 sync-pi.sh）

set -euo pipefail

BASE="/mnt/d/Program Files/piagent"

# 用 pi 专用 conda 环境的 node/npm，避开系统 PATH 里其他 node（如 veryfl 的 v22.9）
export PATH="/mnt/d/ProgramData/Anaconda_envs/envs/piagent_env:$PATH"

# 校验 node 版本 >= 22.19.0（pi 的 engines 要求），防止误用旧 node 造成 EBADENGINE
REQ_NODE="22.19.0"
NODE_BIN="/mnt/d/ProgramData/Anaconda_envs/envs/piagent_env/node.exe"
NODE_VER="$("$NODE_BIN" --version 2>/dev/null | sed 's/^v//; s/\r$//' || true)"
if [ -z "$NODE_VER" ]; then
  echo -e "\e[31m[错误] 找不到 $NODE_BIN，请检查 piagent_env 环境\e[0m" >&2
  exit 1
fi
echo "node: v$NODE_VER (pi 要求 >= v$REQ_NODE)"
if [ "$(printf '%s\n%s\n' "$REQ_NODE" "$NODE_VER" | sort -V | head -1)" != "$REQ_NODE" ]; then
  echo -e "\e[31m[错误] Node.js 版本过低 (v$NODE_VER < v$REQ_NODE)，pi 需要 >= v$REQ_NODE\e[0m" >&2
  echo -e "\e[31m请使用 D:\\ProgramData\\Anaconda_envs\\envs\\piagent_env 里的 node/npm 更新\e[0m" >&2
  exit 1
fi

cd "$BASE"

echo "=== [1/3] 更新 pi 程序本体 (npm) ==="
npm install "@earendil-works/pi-coding-agent@latest"

echo ""
echo "=== [2/3] 拉取配置仓库 (pi-setup / agent-setup) ==="
# origin = 你自己的 fork。如需同步原作者 aqua2k1 的更新，先手动执行：
#   git -C "$BASE/pi-setup" fetch upstream && git -C "$BASE/pi-setup" merge upstream/main
#   git -C "$BASE/agent-setup" fetch upstream && git -C "$BASE/agent-setup" merge upstream/main
git -C "$BASE/pi-setup" pull origin main
git -C "$BASE/agent-setup" pull origin main

echo ""
echo "=== [3/3] 同步配置到 .pi/agent ==="
bash "$BASE/sync-pi.sh"

echo ""
echo "=== 更新完成，重启 pi 生效 ==="
pi --version
