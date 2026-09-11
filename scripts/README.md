# scripts — pi 运行环境管理脚本

这些脚本管理 `D:\Program Files\piagent\` 这个**非 git 仓库**目录：同步配置仓库、
更新 pi 本体、捕获运行时改动。**实际运行的是上一级目录里的同名文件**
（`/mnt/d/Program Files/piagent/*.sh`），本目录是它们的**版本化副本**。

## 文件

| 脚本 | 作用 |
|------|------|
| `sync-pi.sh` | 把 `pi-setup/agent/` 与 `agent-setup/skills/` 同步到 `.pi/agent/`。对 `extensions/`、`agents/`、`prompts/`、`skills/` 使用 `rsync --delete`。带 `--check` / `-n` 参数时**只读预演**，列出会被覆盖（`>`）和删除（`*deleting`）的文件。 |
| `sync-pi-safely.sh` | `sync-pi.sh` 的保险包装：先跑 `--check`，检测到「运行时独有文件」就中止并提示先 capture；同步后校验 `sessions/`、`bin/` 未被破坏。 |
| `capture-pi.sh` | **反向**捕获：`.pi/agent/` → 仓库（不带 `--delete`，永不删仓库文件）。带 `--check` 只报告。 |
| `update-pi.sh` | pi 一键更新：npm 更新程序本体 → git 拉取配置仓库 → 调用 `sync-pi.sh` 同步。 |

## 日常用法

```bash
cd "/mnt/d/Program Files/piagent"

bash sync-pi.sh --check      # 1. 先看有没有会丢的东西
bash capture-pi.sh           # 2. 有漂移就把运行时改动抓回仓库
bash sync-pi.sh              # 3. 同步
# 或直接用保险版，等价于上面 1→3：
bash sync-pi-safely.sh
```

## 两条必须记住的规则

1. **`sync-pi.sh` 会 `rsync --delete`。** 任何只存在于 `.pi/agent/` 而仓库里没有的
   文件，同步时会被删除。新增 `extensions/<name>/`、`prompts/<name>.md`、
   `skills/<name>/` 之后，**必须同时放进仓库**（用 `capture-pi.sh` 或手动）。

2. **排除项不能删。** `EXCLUDES`（`node_modules`、`__pycache__`、`last_model.json`）
   是硬需求：没有它们时 `--delete` 会删掉运行时装好的扩展依赖。曾经因此删掉
   `extensions/subagent-model/node_modules`，而 `extensions/web-tools/node_modules`
   因为仓库里躺着一份副本才幸免——同一件事两个结果，纯属侥幸。

## 同步范围（`sync-pi.sh`）

| 路径 | 来源 | 模式 |
|------|------|------|
| `extensions/` | `pi-setup/agent/extensions/` | rsync --delete |
| `agents/` | `pi-setup/agent/agents/` | rsync --delete |
| `prompts/` | `pi-setup/agent/prompts/` | rsync --delete |
| `skills/` | `agent-setup/skills/` | rsync --delete |
| `APPEND_SYSTEM.md` | `pi-setup/agent/` | cp |
| `web-tools-config.json` | `pi-setup/agent/` | cp |

**不同步**（直接改运行时）：`settings.json`、`pi-websearch.json`、`models.json`、
`subagent-model.json`、`auth.json`、`trust.json`、`AGENTS.md`、`pi-lsp.json`、
`keybindings.json`、`sessions/`、`npm/`、`git/`、`bin/`。

## 保持副本一致

本目录与运行目录的差异由 `capture-pi.sh` / `sync-pi.sh --check` 覆盖检查
（见脚本内的 `scripts` 段落）。改完脚本记得两边都更新，或直接跑 `capture-pi.sh`。
