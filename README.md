# pi-setup

> pi（AI 编码助手）的**配置仓库**。目录结构与运行时 `~/.pi/agent` 一一镜像，
> 同步即 `cp -r`，无映射逻辑。

## 结构

```
pi-setup/
├── .gitignore            # 密钥/运行时数据排除清单（含 models.json、auth.json）
├── README.md             # 本文件：仓库地图
├── biome.json            # 代码格式化（Biome，覆盖扩展/扩展的 TS）
├── tsconfig.json         # TypeScript 工程配置
└── agent/                # ← 镜像 ~/.pi/agent 的运行时配置
    ├── APPEND_SYSTEM.md  # 追加到系统提示的补充
    ├── agents/           # agent 定义，一个 .md = 一个 agent
    │   ├── Explore.md        # 只读代码库探索
    │   ├── Plan.md           # 方案规划（enabled: false）
    │   ├── review.md         # 代码审查
    │   └── websearch.md      # 网页检索
    ├── extensions/       # pi 扩展
    │   ├── commit/           # 深模块示例：core/index 分离 + 测试 + package.json
    │   ├── provider-usage/   # 多 provider 用量统计
    │   ├── subagent-model/   # 子代理模型选择
    │   ├── auto-name-session.ts   # 单文件扩展：/new 时提示命名
    │   ├── expand-default.ts  # 单文件扩展：默认展开工具输出
    │   ├── open.ts / preview.ts / terminal.ts / context-preview.ts
    ├── prompts/          # prompt 模板（含你自己的周期周刊 github/industry/paper-weekly）
    ├── settings.json     # 主配置（模型/主题/包/快捷键相关）
    ├── pi-lsp.json       # LSP 服务器配置
    ├── pi-websearch.json # 网页搜索配置（searxng 自建）
    └── searxng/          # 自建搜索后端配置
```

## 安装

```bash
git clone git@github.com:tymaaa000/pi-setup-yuming.git ~/.pi
```

## 模型说明

- 当前仅启用 **deepseek 原生模型**（`deepseek-v4-pro / -flash / -flash-vision-exp`）。
- `xiaomi-mimo`、`volces-ark` 的 key 已过期，保留在 `models.json` 但未启用。
- ⚠️ `models.json` 含 **apiKey**，已被 `.gitignore` 排除，**不要提交**。

## 设计原则（对齐上游 aqua2k1）

1. **配置集中到 `agent/`**：一个目录镜像运行时，同步简单。
2. **agent 薄 frontmatter**：model/thinking 钉在 agent 上，行为可复现。
3. **扩展做深模块**：复杂扩展 `core/index` 分离 + 依赖注入 + 测试；简单扩展单文件。
4. **密钥/运行时数据不进 git**，配置才进 git。
