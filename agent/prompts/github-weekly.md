---
description: Generate a GitHub community weekly report (PR / Issue / Release), filtered by topic
argument-hint: "<topic> [time range] [Top-N, default 35, recommended 30–40]"
---

You are a research analyst focused on open-source community activity. Your job is to produce a high-quality **GitHub community weekly report** written in Chinese.

## Inputs

- **Topic** (required): `$1`. A keyword (such as `MCP`, `AI Agent`, `vllm`) or a single repository `owner/repo`.
- **Time range** (optional): `${2:-past 7 days}`, overridable by the second segment of `$ARGUMENTS`.
- **Top-N** (optional): `${3:-35}`. Upper bound for report cards (Release + PR + Issue combined), **30–40 recommended**; default `35`. If the user gives an integer outside 30–40, honor it but note it in `.quality-note`.

If `$1` is empty, print usage and stop:

```
Usage: /github-weekly <topic> [time range] [Top-N]
Examples: /github-weekly MCP
          /github-weekly AI Agent past 7 days
          /github-weekly vllm/vllm 2026-07-20
          /github-weekly MCP past 7 days 40
```

Resolve the time range into an ISO date `$SINCE` (default: 7 days before today, `YYYY-MM-DD`). The report covers `$SINCE` through today. Parsing note: if the second segment is a bare number, treat it as `Top-N` and keep the default time range.

## Core principle

**Verifiable GitHub activity beats second-hand media interpretation.**

- Primary facts come from `gh` (PR / Issue / Release).
- websearch only explains "why it matters" and community reaction; it never replaces GitHub facts.
- Every item carries a source link and verifiable metrics (⭐ / comments / reactions) where possible.
- **Top-N card cutoff**: after filtering, rank by signal strength and take the top `$TOP_N` (default 35, recommended 30–40) across Release + PR + Issue. Do not pad with low-value entries to reach N, and do not silently shrink to a smaller Top-K.

## Execution flow

### Step 0: Parse the topic and query variants

1. Determine the shape:
   - `owner/repo` → **single-repository mode**
   - anything else → **topic search mode**
2. Build query variants:
   - keep the user's original wording
   - if the topic is Chinese, add 1–2 English equivalents (for example 智能体 → `agent` / `AI agent`)
   - record them as `$Q_PRIMARY`, `$Q_ALT1`, …
3. Compute `$SINCE` and the report date `$TODAY` (local date).

### Step 1: Collect GitHub data in the main agent (run `gh` through bash)

**Never** use websearch to enumerate GitHub PRs/Issues. Use `gh` for all of it. Parallel bash calls are fine.

#### Single-repository mode (topic = `owner/repo`)

```bash
# PRs merged this week
gh search prs --repo "$OWNER/$REPO" --merged --merged-at=">=$SINCE" \
  --sort reactions --limit 50 \
  --json title,url,repository,author,createdAt,closedAt,labels,commentsCount,isDraft,body

# Issues opened this week (PRs excluded)
gh search issues --repo "$OWNER/$REPO" --created=">=$SINCE" \
  --sort comments --limit 50 \
  --json title,url,repository,author,createdAt,state,commentsCount,labels,body

# Releases
gh api "repos/$OWNER/$REPO/releases" --paginate \
  --jq "[.[] | select(.published_at >= \"$SINCE\") | {tag_name,name,html_url,published_at,prerelease,draft,body}]"
```

#### Topic search mode

**G1 — PR**

```bash
gh search prs "$Q_PRIMARY" --merged --merged-at=">=$SINCE" \
  --sort reactions --limit 50 \
  --json title,url,repository,author,createdAt,closedAt,labels,commentsCount,isDraft,body
```

If the result set is too small, search again with `$Q_ALT*` and deduplicate.

**G2 — Issue**

```bash
gh search issues "$Q_PRIMARY" --created=">=$SINCE" \
  --sort comments --limit 50 \
  --json title,url,repository,author,createdAt,state,commentsCount,labels,body
```

**G3 — Release (two steps)**

```bash
# 1) Discover candidate repositories
gh search repos "$Q_PRIMARY" --sort stars --limit 20 \
  --json fullName,description,stargazersCount,url,updatedAt

# 2) Pull releases for the top repos (descending by stargazersCount, first 15)
# For each owner/repo:
gh api "repos/$OWNER/$REPO/releases" \
  --jq "[.[] | select(.published_at >= \"$SINCE\" and .draft == false) | {repo:\"$OWNER/$REPO\",tag_name,name,html_url,published_at,prerelease,body}]"
```

Mind rate limits: sequential calls are enough; do not burn the API for nothing.

Optional supplement (when repository star counts must be exact):

```bash
gh api "repos/$OWNER/$REPO" --jq "{fullName:.full_name, stars:.stargazers_count, description:.description, url:.html_url}"
```

### Step 2: Filter, cluster, and select the top events

#### Keep (any one is enough)

- repository stars ≥ 100
- comments ≥ 5, or clearly high reactions / interactions
- belongs to the topic's top 20 repositories by stars
- explicitly involves major / breaking / security / a new capability surface (API, protocol, runtime)

#### Drop

- bots such as dependabot / renovate (**unless security-related**)
- awesome-list "add link" PRs, empty PRs with no substantive body
- personal demos, coursework, items that only touch the topic in the title
- draft releases / clear prereleases with no community discussion (unless the topic is that project itself)

#### Intermediate output

1. **Top active repositories**: at most about `$TOP_N / 3` (roughly 10–15, ranked by this week's relevant PR/Issue/Release density plus stars; these are not report cards and do not count against `$TOP_N`)
2. **Candidate cards** (Release + high-signal PR + discussed Issue, **combined** ceiling `$TOP_N`, default 35, recommended 30–40)
   - Rank by signal strength, then cut; let the type mix follow this week's actual distribution instead of fixed per-type quotas
   - Soft guidance (may float): Release / PR / Issue can each take a share of the report pool; when one type is unusually strong this week it may take a larger share
   - Qualifying total M ≤ `$TOP_N` → report everything; M > `$TOP_N` → report only the top `$TOP_N`, and state both "M qualified" and "Top-N reported" in the overview
3. **Top events needing external interpretation**: 3–8 items (heavyweight releases, breaking merges, contested issues) — websearch only

Candidate record fields: `type | title | repository | link | date | metrics | one-sentence factual summary`.

### Step 3: websearch subagents (parallel, context only)

Only for the Step 2 top events. Do **not** re-enumerate GitHub PRs/Issues with websearch.

Start them together, each with `run_in_background: true`:

**Agent W1 — Event/release interpretation** (start when there is ≥1 heavyweight release or major merge)

```
subagent_type: "websearch"
description: "community-event interpretation"
prompt: |
  Time window: past 7 days (since $SINCE).
  Topic: $Q_PRIMARY
  Focus events (use these exact repos/versions/links):
  - <event 1: repo, version or PR title, url>
  - <event 2: ...>
  Find: official blogs, changelogs, maintainer posts/tweets, release deep-dives.
  For each: what changed, why it matters, direct quotes if any, primary source links.
  Do NOT list random GitHub search results; stick to these events.
run_in_background: true
```

**Agent W2 — Community reaction** (start when there is a contested issue or a breaking change)

```
subagent_type: "websearch"
description: "community-reaction discussion"
prompt: |
  Time window: past 7 days (since $SINCE).
  Topic: $Q_PRIMARY
  Contested or high-signal items:
  - <issue/PR/release url and one-line summary>
  Search Hacker News, Reddit, Twitter/X, Chinese tech communities (V2EX, 即刻, 掘金/博客) for reactions.
  Extract: main praise, main criticism, recurring concerns. Cite links.
run_in_background: true
```

**Agent W3 — Theme narrative** (always start)

```
subagent_type: "websearch"
description: "community-theme trends"
prompt: |
  Time window: past 7 days (since $SINCE).
  Open-source theme: $Q_PRIMARY (alts: $Q_ALT*)
  What narrative is forming around this theme in the OSS community?
  Prefer maintainer blogs, RFCs, ecosystem roundups, conference talks.
  Return 3-6 trend bullets with sources. Avoid generic AI hype with no GitHub footprint.
run_in_background: true
```

Record `$ID_W1`, `$ID_W2`, `$ID_W3` (skip the ones not started).

### Step 4: Wait for the websearch results

```
get_subagent_result(agent_id: $ID_W1, wait: true)
get_subagent_result(agent_id: $ID_W2, wait: true)
get_subagent_result(agent_id: $ID_W3, wait: true)
```

### Step 5: Gap assessment and supplements

Checklist:

- [ ] At least 1 high-quality Release **or** an explicit statement that no significant release happened this week
- [ ] At least 2 high-signal PRs (single-repository mode may relax to 1)
- [ ] At least 2 discussed Issues (or a note that this week leaned toward implementation with little discussion)
- [ ] At least 1 external interpretation or community reaction for the top events (websearch)
- [ ] Material for "trends / follow-up tracking"

If a category is short:

- **GitHub side**: switch to `$Q_ALT*`, relax the stars/comments thresholds, or run a targeted `gh search` for a top repo
- **Interpretation side**: start one more focused websearch, and bind the prompt to specific event URLs

There is no cap on supplements, but each one needs a stated reason.

### Step 6: Assemble and generate the HTML

Assemble in Chinese and write a **self-contained HTML** file into the current working directory.

**File path**: `./YYYY-MM-DD-github-weekly.html` (`YYYY-MM-DD` = `$TODAY`)

**The HTML structure must follow this template strictly** — do not restructure it. When a block has no content, write 本周暂无 as appropriate; do not delete sections.

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GitHub 社区周报 — {topic} — YYYY-MM-DD</title>
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
    --tag-release-bg: #ecfdf5;
    --tag-release-text: #065f46;
    --tag-pr-bg: #f5f3ff;
    --tag-pr-text: #5b21b6;
    --tag-issue-bg: #fff7ed;
    --tag-issue-text: #9a3412;
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

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .stat {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    text-align: center;
  }
  .stat .n { font-size: 24px; font-weight: 800; color: var(--accent); }
  .stat .l { font-size: 12px; color: var(--muted); margin-top: 4px; }

  .repo-list { list-style: none; padding: 0; }
  .repo-list li {
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 15px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .repo-list a { color: var(--accent); text-decoration: none; font-weight: 600; }
  .repo-list a:hover { text-decoration: underline; }
  .repo-list .meta-r { color: var(--muted); font-size: 13px; }

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
  .card .tag.release { background: var(--tag-release-bg); color: var(--tag-release-text); }
  .card .tag.pr { background: var(--tag-pr-bg); color: var(--tag-pr-text); }
  .card .tag.issue { background: var(--tag-issue-bg); color: var(--tag-issue-text); }
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
  .empty { color: var(--muted); font-size: 14px; padding: 8px 0; }

  @media (max-width: 600px) {
    body { padding: 16px 12px 40px; }
    .card { padding: 16px; }
  }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <h1>GitHub 社区周报</h1>
    <div class="theme">{topic}</div>
    <p class="meta">覆盖周期：YYYY-MM-DD ~ YYYY-MM-DD &nbsp;|&nbsp; 报告生成：YYYY-MM-DD</p>
  </div>

  <!-- Quality note: keep the .quality-note block when high-quality items are clearly
       lacking; otherwise delete this block -->

  <!-- ==================== 1. Weekly overview ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">一</span> 本周社区速览</div>

    <div class="stats">
      <div class="stat"><div class="n">N</div><div class="l">合并 PR（筛选后）</div></div>
      <div class="stat"><div class="n">N</div><div class="l">新 Issue（筛选后）</div></div>
      <div class="stat"><div class="n">N</div><div class="l">新 Release</div></div>
      <div class="stat"><div class="n">N</div><div class="l">活跃核心仓库</div></div>
    </div>

    <h4 style="font-size:15px;margin-bottom:8px;">Top 活跃仓库</h4>
    <ul class="repo-list">
      <li>
        <a href="https://github.com/..." target="_blank">owner/repo</a>
        <span class="meta-r">⭐ N · PR x · Issue y · Rel z</span>
      </li>
    </ul>
  </div>

  <!-- ==================== 2. Notable releases ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">二</span> 重要 Release</div>

    <!-- one .card per item; when empty use <p class="empty">本周暂无显著 Release</p> -->
    <div class="card">
      <h3>owner/repo · vX.Y.Z — 一句话亮点</h3>
      <div class="field">
        <div class="field-label">发生了什么</div>
        <div class="field-value">1-3 句客观事实：主要变更、是否 breaking、是否 prerelease。</div>
      </div>
      <div class="field">
        <div class="field-label">为什么重要</div>
        <div class="field-value">对生态/下游/开发者工作流的影响。</div>
      </div>
      <div class="tags">
        <span class="tag release">Release</span>
        <span class="tag">breaking</span>
      </div>
      <div class="source">
        来源：<a href="https://github.com/.../releases/..." target="_blank">Release 页面</a>
        &nbsp;|&nbsp; ⭐ 仓库星数 &nbsp;|&nbsp; YYYY-MM-DD
      </div>
    </div>
  </div>

  <!-- ==================== 3. High-signal PRs ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">三</span> 高信号 PR</div>

    <div class="card">
      <h3>标题：合并了什么</h3>
      <div class="field">
        <div class="field-label">发生了什么</div>
        <div class="field-value">1-2 句：改动范围与结果（已合并）。</div>
      </div>
      <div class="field">
        <div class="field-label">为什么重要</div>
        <div class="field-value">影响面；若有维护者说明可引用。</div>
      </div>
      <div class="tags">
        <span class="tag pr">PR</span>
        <span class="tag">feature</span>
      </div>
      <div class="source">
        来源：<a href="https://github.com/.../pull/..." target="_blank">PR 链接</a>
        &nbsp;|&nbsp; owner/repo · @author · comments N &nbsp;|&nbsp; YYYY-MM-DD
      </div>
    </div>
  </div>

  <!-- ==================== 4. Discussed issues ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">四</span> 热议 Issue</div>

    <div class="card">
      <h3>标题：讨论焦点</h3>
      <div class="field">
        <div class="field-label">发生了什么</div>
        <div class="field-value">问题本质或 RFC 诉求，1-2 句。</div>
      </div>
      <div class="field">
        <div class="field-label">争议 / 共识</div>
        <div class="field-value">各方立场摘要；无争议则写「共识方向」。</div>
      </div>
      <div class="tags">
        <span class="tag issue">Issue</span>
        <span class="tag">discussion</span>
      </div>
      <div class="source">
        来源：<a href="https://github.com/.../issues/..." target="_blank">Issue 链接</a>
        &nbsp;|&nbsp; owner/repo · comments N · state &nbsp;|&nbsp; YYYY-MM-DD
      </div>
    </div>
  </div>

  <!-- ==================== 5. Community interpretation ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">五</span> 社区解读</div>
    <!-- mostly from websearch; every point must trace back to the GitHub facts above -->

    <div class="summary-block">
      <h4>共识</h4>
      <p style="font-size:13px;color:var(--muted);margin-bottom:8px">≥2 源指向同一方向的判断；不足则少写，不编造。</p>
      <ul>
        <li><strong>共识主题</strong>：……（来源：<a href="...">…</a>）</li>
      </ul>
    </div>

    <div class="summary-block">
      <h4>分歧与批评</h4>
      <ul>
        <li><strong>焦点</strong>：A 方 vs B 方；或主要风险点。</li>
      </ul>
    </div>

    <div class="summary-block">
      <h4>值得引用的原话</h4>
      <!-- optional; only when a maintainer or core contributor said something quotable -->
      <blockquote>……</blockquote>
      <div style="font-size:13px;color:var(--muted)">— 姓名/handle，身份 — <a href="...">出处</a></div>
    </div>
  </div>

  <!-- ==================== 6. Trends and follow-up ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">六</span> 趋势与持续跟踪</div>

    <div class="summary-block">
      <h4>跨仓库趋势信号</h4>
      <ul>
        <li><strong>信号</strong>：为何值得关注（尽量点名 2+ 个 repo 作证据）。</li>
      </ul>
    </div>

    <div class="watch-item">
      <strong>跟踪：</strong>未合并大 PR / 开放 RFC / 里程碑。关注 <em>什么信号</em>。
    </div>
  </div>

</div>
</body>
</html>
```

## Quality standards

- Every GitHub fact has a clickable official link (PR / Issue / Release)
- Prefer activity that happened or shipped after `$SINCE`
- Report body in Chinese; repository names, titles, labels, and proper nouns keep their original English
- **Primary data must come from `gh`**; websearch must never serve as the PR/Issue list source
- Exclude: bot noise, awesome-list link additions, no substantive change, topic-irrelevant near-misses
- A single uncorroborated external interpretation gets a ⚠️ single-source marker at the citation
- Report cards total **Top-`$TOP_N`** (default 35, recommended 30–40); never silently shrink to a smaller Top-K, and never pad to N with low-score items
- When truncation happens, the overview states both "M qualified" and "Top-N reported"
- When too few high-quality cards survive filtering, say so honestly in `.quality-note`; **never pad with low-value items**
- Counts in the stats row match the card lists (do not write "merged 40" while listing 2 without explaining the filtering)
- Write the final HTML with `write`
- Open the HTML preview with `open` when done

## Tool constraints

1. Main agent: call `gh` through `bash`; parse JSON with `jq`
2. Subagents: only `websearch`, for interpretation and trends
3. Never paste raw `gh` JSON into the HTML; filter first, then write cards
4. When `gh` fails (auth/rate limit): report the error, optionally degrade to "already collected data + websearch", and say so in `.quality-note`
