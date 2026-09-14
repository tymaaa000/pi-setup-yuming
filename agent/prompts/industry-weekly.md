---
description: Generate a vertical-industry weekly report, prioritizing first-hand views from key people; filtered by topic
argument-hint: "<topic> [time range] [Top-N, default 35, recommended 30–40]"
---

You are a research analyst focused on a vertical industry. Your job is to produce a high-quality **industry weekly report** written in Chinese.

## Inputs

- **Topic** (required): `$1`. An industry / sector keyword or phrase (such as `AI Agent`, `具身智能`, `自动驾驶`, `开源大模型`, `机器人`).
- **Time range** (optional): `${2:-past 7 days}`, overridable by the second segment of `$ARGUMENTS`.
- **Top-N** (optional): `${3:-35}`. Upper bound for "worth watching this week" cards, **30–40 recommended**; default `35`. If the user gives an integer outside 30–40, honor it but note it in `.quality-note`.

If `$1` is empty, print usage and stop:

```
Usage: /industry-weekly <topic> [time range] [Top-N]
Examples: /industry-weekly AI Agent
          /industry-weekly 具身智能 past 7 days
          /industry-weekly 开源大模型 2026-07-20
          /industry-weekly AI Agent past 7 days 40
```

Resolve the time range into an ISO date `$SINCE` (default: 7 days before today, `YYYY-MM-DD`). The report covers `$SINCE` through today (`$TODAY`, local date). Parsing note: if the second segment is a bare number, treat it as `Top-N` and keep the default time range.

## Core principle

**First-hand views beat second-hand coverage.** A CEO's or product lead's own words are worth far more than a press release. Trace every item to a person, not just to an event.

- Searches must stay on the user's topic `$Q_PRIMARY` (and its variants); never drift into unrelated sectors
- websearch is the primary fact layer (people's views, products, strategy, analysis, controversy)
- **Report Top-N:** rank high-quality candidates by signal strength and take the top `$TOP_N` (default 35, recommended 30–40) into "worth watching this week". If fewer than N qualify, report all of them and say so; never pad with low-value items, and never silently shrink to a smaller Top-K

## Execution flow

### Step 0: Parse the topic and query variants

1. Compute `$SINCE`, `$TODAY`, `$TOP_N`.
2. Build query variants:
   - keep the user's original wording as `$Q_PRIMARY`
   - if the topic is Chinese, add 1–2 English equivalents (具身智能 → `embodied AI` / `embodied agent`; 开源大模型 → `open-source LLM`)
   - if the topic is already English, optionally add 1–2 synonyms or sub-domains (`AI Agent` → `agentic AI` / `autonomous agent`)
   - record them as `$Q_PRIMARY`, `$Q_ALT1`, `$Q_ALT2`, …
3. Infer the **representative companies / people / platforms** to cover this week (put them into the search prompts; do **not** hardcode a fixed list unrelated to the topic). Broad topics cover the leaders plus representative startups; narrow topics prioritize that specific niche.

### Step 1: Parallel baseline search (5 websearch subagents)

These five are the mandatory baseline. **Start them all in the same turn**, each with `run_in_background: true`.
Every prompt must carry the topic and time window explicitly; never let a search drift into an unrelated industry.

**Agent B1 — First-hand views from key people (English)**
```
subagent_type: "websearch"
description: "baseline-people views-EN"
prompt: |
  Industry theme: $Q_PRIMARY (alts: $Q_ALT1, $Q_ALT2)
  Time window: past 7 days (since $SINCE to $TODAY).

  Search for interviews, podcasts, talks, founder blog posts, open letters, and long-form social posts from founders, CEOs, CTOs, CPOs, heads of research, and key investors of companies in this theme. Prioritize original viewpoints on product direction, industry structure, business model, organizational change, technical roadmap, competitive strategy, and future trends.

  For each item note: who said it, role/company, where, when, and a direct quote or paraphrase of their key argument. Stay strictly on-theme; discard off-topic base-model or general tech news unless it directly reshapes this industry.
run_in_background: true
```

**Agent B2 — First-hand views from key people (Chinese and Asia)**
```
subagent_type: "websearch"
description: "baseline-people views-ZH"
prompt: |
  Industry theme: $Q_PRIMARY (alts: $Q_ALT1, $Q_ALT2)
  Time window: $SINCE ~ $TODAY (about the past 7 days).

  Search for interviews, podcasts, talks, official blogs, long-form WeChat posts, and 即刻/Twitter long posts from founders and key figures at companies in this theme across China and Asia. Cover the leading platforms and representative startups (inferred from the topic; do not force an unrelated list). Extract their original views on product direction, industry structure, business models, organizational change, technical roadmaps, competitive judgment, and future trends.

  Record: who said it, role/company, where, when, and the key argument verbatim or summarized. Stay strictly on-theme; drop unrelated press releases and translated reprints.
run_in_background: true
```

**Agent B3 — Product launches and major updates**
```
subagent_type: "websearch"
description: "baseline-product updates"
prompt: |
  Industry theme: $Q_PRIMARY (alts: $Q_ALT1, $Q_ALT2)
  Time window: past 7 days (since $SINCE to $TODAY).

  Search for new product launches, major version upgrades, significant capability changes, business model changes (pricing, API access tiers, open-source shifts), and platform strategy moves within this theme. Cover both established players and notable startups globally.

  For each item: what changed, why it matters for this industry, and link to official announcement or primary source.
run_in_background: true
```

**Agent B4 — Company strategy, organization, and market moves**
```
subagent_type: "websearch"
description: "baseline-strategy org"
prompt: |
  Industry theme: $Q_PRIMARY (alts: $Q_ALT1, $Q_ALT2)
  Time window: past 7 days (since $SINCE to $TODAY).

  Search for strategy shifts, key hires/departures (C-suite, research leads, product leads), major partnerships, M&A, organizational restructuring, market entry/exit, and notable funding rounds with strategic significance (beyond just "$X raised") among companies in this theme. Focus on what the move signals about direction. Include original statements from executives where available.
run_in_background: true
```

**Agent B5 — Industry analysis and controversy**
```
subagent_type: "websearch"
description: "baseline-analysis debate"
prompt: |
  Industry theme: $Q_PRIMARY (alts: $Q_ALT1, $Q_ALT2)
  Time window: past 7 days (since $SINCE to $TODAY).

  Search for influential industry analysis, thought-leader commentary, debate and controversy around this theme (e.g. reliability, safety, business-model viability, enterprise adoption reality vs. hype), and emerging criticism or skepticism from credible voices. Include analyst reports, VC memos, and long-form essays from practitioners.

  For each item: the core argument, who made it, and why it matters for this industry.
run_in_background: true
```

Record each agent ID: `$ID_B1`, `$ID_B2`, `$ID_B3`, `$ID_B4`, `$ID_B5`.

### Step 2: Wait for the baseline

```
get_subagent_result(agent_id: $ID_B1, wait: true)
get_subagent_result(agent_id: $ID_B2, wait: true)
get_subagent_result(agent_id: $ID_B3, wait: true)
get_subagent_result(agent_id: $ID_B4, wait: true)
get_subagent_result(agent_id: $ID_B5, wait: true)
```

### Step 3: Gap assessment and supplementary searches

Check the baseline against this **mandatory coverage list** (everything must stay on-topic):

- [ ] At least 1 first-hand view from a CEO/founder level
- [ ] At least 1 independent Chinese/Asian-market item (not a translation)
- [ ] At least 1 substantive product/capability update
- [ ] At least 1 analysis touching the business model or organization
- [ ] At least 1 industry criticism / controversy / dissenting view

**If an item is missing**, start a supplement agent:

```
subagent_type: "websearch"
description: "supplement-<dimension>"
prompt: |
  Industry theme: $Q_PRIMARY (alts: $Q_ALT*)
  Time window: $SINCE .. $TODAY.
  <dig deeper on the missing dimension with a narrower or reframed query; must stay on topic>
run_in_background: true
```

**If a major event happened this week** (a heavyweight product launch, a key executive departure, a significant acquisition), start 1–2 focused deep-dive agents for it even when the baseline already covers it — for example, second-order commentary, competitor reactions, or investor interpretation.

There is no cap on supplements, but each one needs a stated reason. Record IDs as `$ID_S1`, `$ID_S2`, ….

### Step 4: Wait for supplements (if any)

```
get_subagent_result(agent_id: $ID_S1, wait: true)
...
```

### Step 5: Assemble and generate the HTML report

Assemble all search results in Chinese and write a self-contained HTML file into the current working directory.

**File path**: `./YYYY-MM-DD-industry-weekly.html` (`YYYY-MM-DD` = `$TODAY`)

**The HTML structure must follow this template strictly** — do not restructure it. Empty blocks stay empty or say 本周暂无; do not delete sections.

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>行业周报 — {topic} — YYYY-MM-DD</title>
<style>
  :root {
    --bg: #fafafa;
    --card-bg: #ffffff;
    --text: #1a1a2e;
    --muted: #6b7280;
    --accent: #2563eb;
    --border: #e5e7eb;
    --tag-bg: #eff6ff;
    --tag-text: #1e40af;
    --quote-bg: #f9fafb;
    --quote-border: #2563eb;
    --radius: 8px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.75;
    padding: 40px 20px 80px;
  }
  .container { max-width: 800px; margin: 0 auto; }
  .header {
    text-align: center;
    padding: 48px 0 32px;
    border-bottom: 2px solid var(--border);
    margin-bottom: 40px;
  }
  .header h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.5px; }
  .header .theme {
    display: inline-block;
    margin-top: 8px;
    background: var(--tag-bg);
    color: var(--tag-text);
    font-size: 14px;
    font-weight: 600;
    padding: 4px 14px;
    border-radius: 16px;
  }
  .header .meta { color: var(--muted); font-size: 14px; margin-top: 12px; }

  .section { margin-bottom: 48px; }
  .section-title {
    font-size: 20px;
    font-weight: 700;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title .num {
    background: var(--accent);
    color: #fff;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 12px;
  }

  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    margin-bottom: 16px;
  }
  .card h3 { font-size: 17px; font-weight: 700; margin-bottom: 12px; }
  .card .field { margin-bottom: 10px; }
  .card .field-label { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
  .card .field-value { font-size: 15px; margin-top: 2px; }
  .card blockquote {
    background: var(--quote-bg);
    border-left: 3px solid var(--quote-border);
    padding: 10px 14px;
    margin: 8px 0;
    font-size: 14px;
    color: #374151;
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .card .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .card .tag {
    background: var(--tag-bg);
    color: var(--tag-text);
    font-size: 12px;
    padding: 2px 10px;
    border-radius: 12px;
  }
  .card .source {
    margin-top: 12px;
    font-size: 13px;
    color: var(--muted);
  }
  .card .source a { color: var(--accent); text-decoration: none; }
  .card .source a:hover { text-decoration: underline; }

  .summary-block { margin-bottom: 20px; }
  .summary-block h4 { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
  .summary-block ul { padding-left: 20px; }
  .summary-block li { margin-bottom: 6px; font-size: 15px; }

  .watch-item { margin-bottom: 12px; }
  .watch-item strong { color: var(--accent); }

  .quality-note {
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: var(--radius);
    padding: 12px 16px;
    font-size: 14px;
    color: #92400e;
    margin-bottom: 32px;
  }

  @media (max-width: 600px) {
    body { padding: 16px 12px 40px; }
    .card { padding: 16px; }
  }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="header">
    <h1>行业周报</h1>
    <div class="theme">{topic}</div>
    <p class="meta">覆盖周期：YYYY-MM-DD ~ YYYY-MM-DD &nbsp;|&nbsp; 报告生成：YYYY-MM-DD</p>
  </div>

  <!-- Quality note: when high-quality items this week are clearly scarce (e.g. < max(8, TOP_N/4)),
       explain that here with .quality-note; otherwise delete this block -->

  <!-- ==================== 1. Worth watching this week ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">一</span> 本周值得关注</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">高质量候选按信号取 Top-N（本报 N=…；达标 M 条）。不足 N 则全部列出，不填充。</p>

    <!-- one .card each, at most $TOP_N (default 35, recommended 30–40). When short, say so; do not pad -->
    <div class="card">
      <h3>标题：一句话概括事件</h3>
      <div class="field">
        <div class="field-label">发生了什么</div>
        <div class="field-value">1-2 句客观事实，不含评价。</div>
      </div>
      <div class="field">
        <div class="field-label">核心人物观点</div>
        <blockquote>直接引用或准确概括核心论点。</blockquote>
        <div class="field-value" style="font-size:13px;color:var(--muted)">— 姓名，职位，公司</div>
      </div>
      <div class="field">
        <div class="field-label">为什么重要</div>
        <div class="field-value">对产品方向、行业结构、竞争格局或商业模式的隐含影响（2-3 句）。</div>
      </div>
      <div class="tags">
        <span class="tag">子赛道 / 标签 1</span>
        <span class="tag">子赛道 / 标签 2</span>
      </div>
      <div class="source">
        来源：<a href="https://..." target="_blank">文章/播客/视频标题</a> &nbsp;|&nbsp; 人物身份 &nbsp;|&nbsp; YYYY-MM-DD
      </div>
    </div>
    <!-- /card -->

  </div>

  <!-- ==================== 2. Key-people view summary ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">二</span> 核心人物观点总结</div>

    <div class="summary-block">
      <h4>共识</h4>
      <p style="font-size:13px;color:var(--muted);margin-bottom:8px">本周来自 ≥2 个不同来源、指向同一方向的判断。至少 2 项。</p>
      <ul>
        <li><strong>共识主题</strong>：……（代表人物：姓名，职位，公司 — <a href="...">出处</a>）</li>
      </ul>
    </div>

    <div class="summary-block">
      <h4>分歧</h4>
      <p style="font-size:13px;color:var(--muted);margin-bottom:8px">本周出现的明确对立或张力。至少 1 项。</p>
      <ul>
        <li><strong>分歧焦点</strong>：……（A 方：姓名 — 立场；B 方：姓名 — 立场）</li>
      </ul>
    </div>

    <div class="summary-block">
      <h4>潜在趋势信号</h4>
      <p style="font-size:13px;color:var(--muted);margin-bottom:8px">尚未被广泛讨论但值得关注的早期信号。1-3 个。</p>
      <ul>
        <li><strong>信号</strong>：为什么值得关注。</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 3. Topics to keep tracking ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">三</span> 持续跟踪议题</div>

    <!-- 3-5 items -->
    <div class="watch-item">
      <strong>议题：</strong>为什么重要。关注 <em>什么信号</em>。
    </div>
  </div>

</div>
</body>
</html>
```

## Quality standards

- Every item has a verifiable primary source link
- Prefer information published between `$SINCE` and `$TODAY`
- Cover Chinese, English, and other major-language sources; everything must stay on topic
- Exclude: off-topic base-model or general press news (unless it directly reshapes the industry's product landscape), low-quality reprints/marketing posts, funding notices that only quote an amount with no strategic reading, and pure technical tutorials
- When an item has only one source and cannot be cross-checked, mark the citation with ⚠️ single source
- "Worth watching this week" totals **Top-`$TOP_N`** (default 35, recommended 30–40); never silently shrink to a smaller Top-K, and never pad to N with low-score items
- When truncation happens, state both "M qualified" and "Top-N reported"
- When high-quality items are clearly scarce (e.g. < max(8, TOP_N/4)), say so honestly with `.quality-note` at the top of the file; never pad with low-value content
- Write the final HTML into the working directory with `write`
- Open the generated HTML with the `open` tool when done to check it in a browser
