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

当前仅 **deepseek 原生模型**可用于。`enabledModels` 已精简为以下 3 个（已逐一实测）：

| 模型 | 状态 | 认证来源 |
|------|------|----------|
| `deepseek/deepseek-v4-pro` | ✅ 可用 | `auth.json` (deepseek) |
| `deepseek/deepseek-v4-flash` | ✅ 可用 | `auth.json` (deepseek) |
| `deepseek/deepseek-v4-flash-vision-exp` | ✅ 可用（默认） | `auth.json` (deepseek) |
| `xiaomi-mimo/*`（2 个） | ❌ 已过期 | models.json key 401 |
| `volces-ark/*`（9 个） | ❌ 已过期 | models.json key 401 |

> ⚠️ `volces-ark` 走的是 `anthropic-messages` 格式，但 key 已失效；`xiaomi-mimo` 为 `openai-completions`，key 同样失效。
> ⚠️ `models.json` 含 **apiKey**，已被 `.gitignore` 排除，**不要提交**。

### 验证方法（复测可用性）

```bash
python3 -c "import json,urllib.request as u;d=json.load(open('models.json'));\
[print(p+'/'+m['id'], '->', 'PASS' if (lambda: __import__('urllib.request',fromlist=['urlopen']).urlopen(u.Request(d['providers'][p]['baseUrl']+'/chat/completions',data=json.dumps({'model':m['id'],'messages':[{'role':'user','content':'hi'}],'max_tokens':16}).encode(),method='POST',headers={'Authorization':'Bearer '+d['providers'][p]['apiKey'],'Content-Type':'application/json'}),timeout=15).status==200)() else 'FAIL') for p in d['providers'] for m in d['providers'][p]['models']]"
```

> 注意：直接测 `models.json` 里的 key 会全部 401；**真实可用于的认证来自 `auth.json`**（deepseek/moonshotai-cn/xai）。

## 设计原则（对齐上游 aqua2k1）

1. **配置集中到 `agent/`**：一个目录镜像运行时，同步简单。
2. **agent 薄 frontmatter**：model/thinking 钉在 agent 上，行为可复现。
3. **扩展做深模块**：复杂扩展 `core/index` 分离 + 依赖注入 + 测试；简单扩展单文件。
4. **密钥/运行时数据不进 git**，配置才进 git。

## 技能（在 agent-setup 仓库）

本仓库是**引擎配置**；**技能**在 [`agent-setup`](../agent-setup) 仓库，同步到 `~/.pi/agent/skills/`。

| 技能 | 作用 |
|------|------|
| `metrics` | 用量量化：按模型/项目/日期/工具/子代理聚合 token，输出改进信号 |
| `cleanup` | 安全清理：删旧会话 + 截断崩溃日志（默认 dry-run，需 `--apply` 才删）|
| `setup-update` | 上游更新检查/合并/推送 |

> 用法：对话中 `/skill:metrics`、`/skill:cleanup`；或直接跑 `skills/u/<name>/scripts/` 下的脚本。
