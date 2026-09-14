---
description: Generate an English-paper weekly report (preprints / accepted / trending), filtered by topic with dynamic venue discovery
argument-hint: "<topic> [time range] [Top-N, default 35, recommended 30–40]"
---

You are a research analyst focused on the academic frontier. Your job is to produce a high-quality **English-paper weekly report** written in Chinese.

## Inputs

- **Topic** (required): `$1`. A free keyword or phrase (such as `AI Agent`, `Gaussian Splatting`, `LLM safety`, `tool use`).
- **Time range** (optional): `${2:-past 7 days}`, overridable by the second segment of `$ARGUMENTS`.
- **Top-N** (optional): `${3:-35}`. Upper bound for papers in the report, **30–40 recommended**; default `35`. If the user gives an integer outside 30–40, honor it but note it in `.quality-note`.

If `$1` is empty, print usage and stop:

```
Usage: /paper-weekly <topic> [time range] [Top-N]
Examples: /paper-weekly AI Agent
          /paper-weekly Gaussian Splatting past 7 days
          /paper-weekly LLM reasoning 2026-07-20
          /paper-weekly AI Agent past 7 days 40
```

Resolve the time range into an ISO date `$SINCE` (default: 7 days before today, `YYYY-MM-DD`). The report covers `$SINCE` through today (`$TODAY`, local date). Parsing note: if the second segment is a bare number, treat it as `Top-N` and keep the default time range.

## Core principle

**Verifiable paper metadata beats second-hand media interpretation.**

- The primary fact layer comes from **parallel general-purpose subagents** running `curl` against scholarly APIs (arXiv ×2 / OpenAlex ×2 / HuggingFace Daily Papers / Semantic Scholar / Crossref; including **public abstracts** of paywalled venues such as IEEE)
- **English papers only** (`language:en`, or English title/abstract; Chinese journals and Chinese titles are dropped)
- **No static top-conference routing table**; venues are counted and discovered **dynamically** from this week's hits
- **Paywalled sites (IEEE / ACM / Springer)**: never download full texts and never bypass paywalls; judge relevance and inclusion from **public title + abstract only**; a DOI, IEEE Xplore abstract page, or OpenAlex record is enough
- websearch only explains "why it matters" and community reaction; it never replaces the paper list
- **Final Top-N cutoff**: after relevance passes, rank by score and take the top `$TOP_N` (default 35, recommended 30–40). Cluster by direction for presentation; do not cut a second time for layout

## Execution flow

**The main agent only orchestrates and assembles**: parse inputs → start/wait for subagents → merge and score → write the HTML.
**Never** let the main agent batch-curl scholarly APIs itself; collection and (optional) gap-filling always go to `general-purpose` subagents (they can run `bash`/`curl`).
**Never** use websearch to enumerate the week's papers.

### Step 0: Parse the topic and query variants (main agent)

1. Compute `$SINCE`, `$TODAY`, `$TOP_N`.
2. Build English query variants (**search in English only**):
   - if the user's topic is Chinese → translate it into 1–3 idiomatic English scholarly queries (具身智能 → `embodied AI` / `embodied agent` / `vision-language-action`)
   - if the topic is already English → keep it and optionally add 1–2 synonyms or sub-domains (`AI Agent` → `tool-using agent` / `agentic LLM`)
   - record them as `$Q_PRIMARY`, `$Q_ALT1`, `$Q_ALT2`, …
3. **Do not** preset a venue whitelist and do not guess "which top conference owns this topic". Venues are discovered from collection results.

### Step 1: Start collection subagents in parallel (all general-purpose)

These **7 are the mandatory baseline**; **start them all in the same turn** (each `run_in_background: true`, `subagent_type: "general-purpose"`).
Do not wait for one before starting the next — parallel is the default.
Each agent uses `bash` + `curl` itself (parse with `jq` / `python3`) and **returns a structured candidate list** (never a full raw JSON/XML dump).

**Rate-limit notes (put into the relevant prompts):**

- **arXiv**: strict global rate limits — C1/C2 must **not** open more arXiv parallelism; sleep 3 between queries inside an agent
- **OpenAlex / S2 / Crossref / HF**: parallel across agents is fine; on 429 inside an agent, sleep and retry once, and note the failure

Shared contract (put into every prompt):

```
UA='paper-weekly/1.0 (mailto:local@example.com; research digest)'
Time window: $SINCE .. $TODAY
English papers only. Discard non-English titles/abstracts.
Return a compact bullet/JSON list of candidates with fields when available:
  title, authors, date, venue_or_arxiv_cat, arxiv_id, doi, abs_url, pdf_url_or_landing,
  abstract_snippet (≤400 chars), cited_by_count, hf_upvotes, source_tag, one_line_contribution
Do NOT invent abstracts or metrics. If abstract missing, leave empty.
```

**Agent C1 — arXiv · primary query**

```
subagent_type: "general-purpose"
description: "collect-arXiv primary"
prompt: |
  You collect English arXiv preprints for a weekly paper digest. Use bash + curl only (no websearch for listing).

  UA='paper-weekly/1.0 (mailto:local@example.com; research digest)'
  SINCE=$SINCE
  TODAY=$TODAY
  Query (PRIMARY only): $Q_PRIMARY

  curl -sG "https://export.arxiv.org/api/query" \
    -H "User-Agent: $UA" \
    --data-urlencode "search_query=all:\"$Q_PRIMARY\"" \
    --data-urlencode "sortBy=submittedDate" \
    --data-urlencode "sortOrder=descending" \
    --data-urlencode "start=0" \
    --data-urlencode "max_results=80"

  Optional follow-up (sleep 3 first): from this page's primary_category histogram, one query
  (cat:TOP1 OR cat:TOP2 ...) AND all:"$Q_PRIMARY", max_results=50.

  Parse Atom/XML. Keep published >= SINCE (or updated >= SINCE with vN>=2 as "vN update").
  Normalize arxiv_id to XXXX.XXXXX. Extract title, summary, authors, dates, categories, abs_url, pdf_url.
  English only. Drop CJK-dominant text.
  source_tag=arxiv. Return up to ~80 unique candidates. No full XML dump.
run_in_background: true
```

**Agent C2 — arXiv · alt queries** (start it even without ALT; it returns empty + note)

```
subagent_type: "general-purpose"
description: "collect-arXiv alt"
prompt: |
  You collect English arXiv preprints using ALT queries only. Use bash + curl only.

  UA='paper-weekly/1.0 (mailto:local@example.com; research digest)'
  SINCE=$SINCE
  TODAY=$TODAY
  Alt queries: $Q_ALT1 ; $Q_ALT2 (skip empties). If no alts: return empty list and note "no alts".

  For each alt query (sleep 3 between requests):
  curl -sG "https://export.arxiv.org/api/query" \
    -H "User-Agent: $UA" \
    --data-urlencode "search_query=all:\"<alt>\"" \
    --data-urlencode "sortBy=submittedDate" \
    --data-urlencode "sortOrder=descending" \
    --data-urlencode "start=0" \
    --data-urlencode "max_results=60"

  Same parse/filter rules as primary arXiv: published>=SINCE (or vN update), English only, normalize arxiv_id.
  source_tag=arxiv_alt. Compact unique candidates only.
run_in_background: true
```

**Agent C3 — OpenAlex · primary**

```
subagent_type: "general-purpose"
description: "collect-OpenAlex primary"
prompt: |
  You collect English works from OpenAlex (PRIMARY query). Use bash + curl only.

  UA='paper-weekly/1.0 (mailto:local@example.com; research digest)'
  SINCE=$SINCE
  TODAY=$TODAY
  Query: $Q_PRIMARY

  curl -sG "https://api.openalex.org/works" \
    -H "User-Agent: $UA" \
    --data-urlencode "search=$Q_PRIMARY" \
    --data-urlencode "filter=from_publication_date:$SINCE,to_publication_date:$TODAY,language:en" \
    --data-urlencode "sort=publication_date:desc" \
    --data-urlencode "per_page=50" \
    --data-urlencode "select=id,doi,title,display_name,publication_date,type,cited_by_count,authorships,primary_location,open_access,concepts,abstract_inverted_index"

  Paginate page=2.. while useful or until relevance collapses.
  Reconstruct abstract from abstract_inverted_index with short Python if needed; never fabricate.
  Keep type article/preprint; drop paratext.
  Capture primary_location.source.display_name as venue (no fixed whitelist).
  Return candidates (source_tag=openalex) + venue_histogram from your hits.
run_in_background: true
```

**Agent C4 — OpenAlex · alt queries** (empty + note when no ALT)

```
subagent_type: "general-purpose"
description: "collect-OpenAlex alt"
prompt: |
  You collect English works from OpenAlex using ALT queries only. Use bash + curl only.

  UA='paper-weekly/1.0 (mailto:local@example.com; research digest)'
  SINCE=$SINCE
  TODAY=$TODAY
  Alts: $Q_ALT1 ; $Q_ALT2 (skip empties). If none: return empty + note "no alts".

  For each alt: same OpenAlex works endpoint as primary, filter date+language:en, per_page=50,
  paginate lightly (1–2 pages) if meta.count large. Dedupe within this agent by OpenAlex id/DOI/title.
  Reconstruct abstracts when inverted index present. Keep article/preprint.
  source_tag=openalex_alt. Return compact candidates + venue_histogram.
run_in_background: true
```

**Agent C5 — HuggingFace Daily Papers (heat)**

```
subagent_type: "general-purpose"
description: "collect-HF heat"
prompt: |
  You collect HuggingFace Daily Papers signals. Use bash + curl only.

  UA='paper-weekly/1.0 (mailto:local@example.com; research digest)'
  SINCE=$SINCE
  Queries: $Q_PRIMARY and alts $Q_ALT*

  curl -s "https://huggingface.co/api/daily_papers" -H "User-Agent: $UA"
  Filter publishedAt >= SINCE. Keyword/semantic filter title/summary against queries (English).
  Keep paper.id (arxiv), upvotes, title, summary, authors.
  source_tag=hf. HF is recall+heat only — return candidates even if later merged with arXiv.
  Compact list only.
run_in_background: true
```

**Agent C6 — Semantic Scholar (public abstracts of paywalled venues such as IEEE)**

```
subagent_type: "general-purpose"
description: "collect-S2 abstracts"
prompt: |
  You search Semantic Scholar for English papers (including paywalled IEEE/ACM/Springer)
  for theme "$Q_PRIMARY" (alts: $Q_ALT*) in window $SINCE .. $TODAY.
  Use bash + curl only. Do NOT download full PDFs, do NOT bypass paywalls.
  Relevance from TITLE + ABSTRACT only.

  For primary and each alt (if 429, sleep 2–5s and retry once):
  curl -sG "https://api.semanticscholar.org/graph/v1/paper/search" \
    -H "User-Agent: paper-weekly/1.0 (mailto:local@example.com; research digest)" \
    --data-urlencode "query=<query>" \
    --data-urlencode "limit=50" \
    --data-urlencode "fields=title,abstract,year,venue,publicationDate,externalIds,url,citationCount,authors"

  Client-filter publicationDate into [$SINCE,$TODAY] when present; if only year, keep current/prior year and mark date_uncertain=true.
  Prefer IEEE / IEEE Xplore / Trans. / ACM / Springer venue strings, but keep other formal venues if highly on-topic.
  Drop if abstract empty AND title ambiguous. Never claim full-text access.
  Landing: DOI, S2 url, or IEEE abstract page if in externalIds.
  source_tag=s2 (add ieee_paywall_abstract when venue looks paywalled).
  Return compact candidates + which queries worked/failed.
run_in_background: true
```

**Agent C7 — Crossref (formal DOIs / paywalled-journal abstracts)**

```
subagent_type: "general-purpose"
description: "collect-Crossref"
prompt: |
  You collect English works via Crossref for theme "$Q_PRIMARY" (alts: $Q_ALT*)
  in window $SINCE .. $TODAY. Use bash + curl only. No PDF downloads / no paywall bypass.

  UA='paper-weekly/1.0 (mailto:local@example.com; research digest)'

  For primary and alts:
  curl -sG "https://api.crossref.org/works" \
    -H "User-Agent: $UA" \
    --data-urlencode "query=<query>" \
    --data-urlencode "filter=from-pub-date:$SINCE,until-pub-date:$TODAY" \
    --data-urlencode "rows=50" \
    --data-urlencode "select=DOI,title,author,published-print,published-online,abstract,container-title,type,URL,is-referenced-by-count"

  Prefer type journal-article / proceedings-article. English titles/abstracts only.
  Strip JATS tags from abstract if present. If no abstract: keep only when title strongly on-topic; mark abstract_missing=true; else DROP.
  Capture container-title as venue (IEEE/ACM/Springer appear naturally — no whitelist).
  source_tag=crossref. Compact candidates only.
run_in_background: true
```

Record `$ID_C1` … `$ID_C7`.

Launch requirements:

1. Issue all 7 `subagent(..., run_in_background: true)` calls **in one turn** (parallel calls in the same assistant message)
2. Do not `wait` for C1 before starting C2 …
3. If an ALT is empty: still start C2/C4 so they quickly return empty (keeps orchestration uniform)

### Step 2: Wait for the collection results

```
get_subagent_result(agent_id: $ID_C1, wait: true)
get_subagent_result(agent_id: $ID_C2, wait: true)
get_subagent_result(agent_id: $ID_C3, wait: true)
get_subagent_result(agent_id: $ID_C4, wait: true)
get_subagent_result(agent_id: $ID_C5, wait: true)
get_subagent_result(agent_id: $ID_C6, wait: true)
get_subagent_result(agent_id: $ID_C7, wait: true)
```

If one source fails or is empty: do not block the others; note the degradation later in `.quality-note`.

### Step 3: Main agent filtering, dedupe, dynamic venues, relevance, Top-N

Merge all candidates from **C1–C7**.

#### Dedupe keys (in priority order)

1. arXiv id
2. DOI
3. normalized title (lowercase, punctuation stripped, whitespace collapsed)

Merge fields: one paper may carry an arXiv link, a DOI, a venue, HF upvotes, cited_by_count, and a paywalled-venue abstract source at once.

#### Must drop

- non-English (title or dominant body language)
- mere word-level overlap with the topic where the abstract's core contribution clearly belongs elsewhere
- no title / no usable link (no arXiv, no DOI, no OpenAlex/S2/IEEE landing page)
- **paywalled venue with no abstract and a title too weak to judge the topic** → drop (never include just because of the journal name)
- obviously non-papers (recruitment ads, CfP text treated as a paper, pure press releases)
- duplicate uploads of the same work (keep the one with more information)

#### Relevance scoring + Top-N cutoff

Give every item a coarse score, **drop anything below the threshold**, then sort the survivors by `score` descending and **take the top `$TOP_N`** (break ties with HF upvotes, cited_by_count, or multi-source corroboration):

```
score =
  +3  title matches $Q_PRIMARY or a strong ALT
  +2  first sentences of the abstract match the topic's mechanism/task (not just background)
  +2  dynamic core-venue hit (see below)
  +1  HF upvotes ≥ 1 or cited_by_count unusually high for the week
  +1  appears across multiple sources (arXiv ∩ OpenAlex, arXiv ∩ HF, S2 ∩ OpenAlex, …)
  -3  shares only generic words (matched merely on "learning" / "model")
```

Suggested threshold: `score >= 3` (tune slightly with topic breadth; if you relax it, say so in quality-note).

**Top-N rules:**

- Default `$TOP_N = 35`, recommended range **30–40**
- Qualifying papers ≤ `$TOP_N` → report all
- Qualifying papers > `$TOP_N` → output only the top `$TOP_N`; state "M qualified, Top-$TOP_N reported" in the overview
- Do **not** sneak truncated high-relevance papers back into the cards; optionally name 1–3 directions worth watching in "trends and follow-up"
- **Never** shrink to a hidden smaller cap such as Top-10, and never pad to N with low-score noise

#### Dynamic venue / journal discovery (replaces the routing table)

Count over this week's **relevance-filtered** items:

```
venue_histogram[source_display_name] += 1
```

Rules:

1. Venues appearing ≥ 2 times → **active venues this week**
2. A venue appearing once but looking like a formal conference/journal, or accompanied by high citation/HF heat → still enters the histogram as a **long-tail venue**
3. arXiv categories without a formal venue → counted as **`arXiv-only`**, with a second histogram by `primary_category`
4. IEEE / paywalled journal names are treated **exactly like other venues**; the histogram comes entirely from this week's data (no IEEE whitelist, and no excluding IEEE)
5. Derive **3–8 research-direction clusters** from the active venues and the titles/abstracts (cluster names in Chinese plus the English term); assign each paper one primary cluster (a secondary tag is allowed)

Carry these intermediates into the following steps:

1. **Reported paper list** (qualified and within Top-`$TOP_N`)
   Fields: `title | authors | date | venue or arXiv cat | link | metrics (upvotes/cited) | cluster | score | one-line contribution | source tags | abstract_only?`
2. **Cutoff stats**: total qualified M, reported min(M, TOP_N), whether truncation happened
3. **Venue histogram** (the dynamic discovery result; may be computed over all qualified items, not just Top-N)
4. **Direction clusters** (clustered over the reported set)
5. **Headline list needing external interpretation**: 3–8 papers (new methods, new benchmarks, clear SOTA, high HF heat, contested settings, high-impact IEEE/formal venues) — websearch only

### Step 4: websearch subagents (parallel, context only)

Only for the Step 3 headline list and overall trends. Do **not** re-enumerate the week's papers with websearch.

Start them together, each with `run_in_background: true`:

**Agent W1 — First-hand paper/author interpretation** (start with ≥1 headline paper)

```
subagent_type: "websearch"
description: "paper-author interpretation"
prompt: |
  Time window: since $SINCE to $TODAY.
  Topic: $Q_PRIMARY (alts: $Q_ALT*)
  Focus papers (use these exact titles / arXiv ids / DOI / links):
  - <paper 1: title, arxiv or doi, url>
  - <paper 2: ...>
  Find: author Twitter/X threads, official blog posts, project pages, code releases, talk slides.
  For each: what the authors claim is new, key results, limitations they admit, primary links.
  English sources preferred. Do NOT dump unrelated paper lists.
  Paywalled IEEE/ACM: secondary commentary is fine; do not claim you read the full PDF.
run_in_background: true
```

**Agent W2 — Community reaction and second-hand depth** (always start)

```
subagent_type: "websearch"
description: "paper-community reaction"
prompt: |
  Time window: since $SINCE to $TODAY.
  Topic: $Q_PRIMARY
  Papers or claims to check reactions for:
  - <title / arxiv / doi / one-line claim>
  Search: Twitter/X, Reddit, Hacker News, HuggingFace paper pages, blogs, Chinese tech media (机器之心、专知、知乎深度) discussing THESE papers or the same narrow topic this week.
  Extract: praise, skepticism, reproducibility notes. Cite links.
  Do not invent papers not in the focus list; if you find an important English paper from this week missing from the list, return it as "candidate miss" with link for the main agent to verify via a general-purpose curl agent (arXiv/OpenAlex/S2) — never accept second-hand titles alone.
run_in_background: true
```

**Agent W3 — Theme narrative** (always start)

```
subagent_type: "websearch"
description: "paper-theme trends"
prompt: |
  Time window: since $SINCE to $TODAY.
  Research theme: $Q_PRIMARY (alts: $Q_ALT*)
  Dynamically observed venues this week (not a fixed whitelist):
  - <venue histogram top entries>
  What research narrative is forming? New benchmarks, problem formulations, method families, or evaluation critiques.
  Prefer primary sources and technical blogs over SEO listicles.
  Return 3-8 trend bullets with sources.
run_in_background: true
```

Record `$ID_W1`, `$ID_W2`, `$ID_W3` (skip the ones not started).

### Step 5: Wait for the websearch results

```
get_subagent_result(agent_id: $ID_W1, wait: true)
get_subagent_result(agent_id: $ID_W2, wait: true)
get_subagent_result(agent_id: $ID_W3, wait: true)
```

### Step 6: Gap assessment and supplements (still subagents)

Checklist:

- [ ] Does the main list come from general-purpose subagents' curl APIs rather than media "weekly papers" reposts?
- [ ] Are all papers English?
- [ ] Is there a **dynamic venue histogram** (even if most items are arXiv-only)?
- [ ] Are paywalled venues (such as IEEE) included only with abstract/strong-title evidence?
- [ ] Does every headline paper have at least one external interpretation, or an explicit "no author commentary found yet"?
- [ ] If W2 returned `candidate miss`: start another **general-purpose** agent to **curl-verify date and English** via arXiv/OpenAlex/S2 before merging; never trust a second-hand title directly

If recall is insufficient, start supplement agents (possibly several, `run_in_background: true`):

```
subagent_type: "general-purpose"
description: "supplement-paper recall"
prompt: |
  Gap fill for paper weekly. Theme $Q_PRIMARY / alts. Window $SINCE..$TODAY.
  Reason for this run: <e.g. too few hits / need alt query / top arXiv cats / verify candidate miss URLs>.
  Use bash+curl on arXiv / OpenAlex / Semantic Scholar as needed. Sleep 3 between arXiv calls.
  English only. Return compact new candidates; for paywalled venues require abstract for inclusion.
run_in_background: true
```

For interpretation gaps: start another focused `websearch` with the prompt bound to specific paper URLs/titles.

After supplementing, re-score and re-sort, still keeping only Top-`$TOP_N`; do not exceed N to fill gaps unless the user explicitly gave a larger Top-N.
Do **not** fall back to a static top-conference whitelist.

### Step 7: Assemble and generate the HTML

Assemble in Chinese and write a **self-contained HTML** file into the current working directory.

**File path**: `./YYYY-MM-DD-paper-weekly.html` (`YYYY-MM-DD` = `$TODAY`)

**The HTML structure must follow this template strictly** — do not restructure it. Empty blocks say 本周暂无 honestly; do not delete sections.
**Paper cards: output the Top-`$TOP_N` items** (default 35, recommended 30–40), optionally grouped into direction clusters. Do not cut a second time inside Top-N, and do not pad to N with low-score items.

Paywalled-venue cards: `tags` may include `IEEE` / `paywalled`; `source` links to the DOI or the abstract landing page; write the body from the abstract and **never pretend to have read the full text**; note "基于公开摘要" in the "what happened" field when applicable.

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>学术论文周报 — {topic} — YYYY-MM-DD</title>
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
    --tag-preprint-bg: #f5f3ff;
    --tag-preprint-text: #5b21b6;
    --tag-accepted-bg: #ecfdf5;
    --tag-accepted-text: #065f46;
    --tag-hot-bg: #fff7ed;
    --tag-hot-text: #9a3412;
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
  .repo-list .meta-r { color: var(--muted); font-size: 13px; }

  .cluster-title {
    font-size: 16px;
    font-weight: 700;
    margin: 28px 0 12px;
    color: var(--text);
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
  .card .tag.preprint { background: var(--tag-preprint-bg); color: var(--tag-preprint-text); }
  .card .tag.accepted { background: var(--tag-accepted-bg); color: var(--tag-accepted-text); }
  .card .tag.hot { background: var(--tag-hot-bg); color: var(--tag-hot-text); }
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
    <h1>学术论文周报</h1>
    <div class="theme">{topic}</div>
    <p class="meta">覆盖周期：YYYY-MM-DD ~ YYYY-MM-DD &nbsp;|&nbsp; 报告生成：YYYY-MM-DD &nbsp;|&nbsp; 语种：English only</p>
  </div>

  <!-- Quality note: keep the .quality-note block when recall is clearly low, an API failed,
       or the threshold was relaxed; otherwise delete this block -->

  <!-- ==================== 1. Weekly research overview ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">一</span> 本周研究速览</div>

    <div class="stats">
      <div class="stat"><div class="n">N</div><div class="l">入报论文（Top-N）</div></div>
      <div class="stat"><div class="n">N</div><div class="l">达标总数</div></div>
      <div class="stat"><div class="n">N</div><div class="l">arXiv 预印本</div></div>
      <div class="stat"><div class="n">N</div><div class="l">方向簇</div></div>
    </div>

    <h4 style="font-size:15px;margin-bottom:8px;">动态 Venue 分布（本周数据发现，非预设名单）</h4>
    <ul class="repo-list">
      <li>
        <span>Venue 或 arXiv-only / cs.XX</span>
        <span class="meta-r">N 篇</span>
      </li>
    </ul>

    <h4 style="font-size:15px;margin:16px 0 8px;">检索式</h4>
    <p style="font-size:14px;color:var(--muted)">Primary: … · Alt: …</p>
  </div>

  <!-- ==================== 2. Paper entries (Top-N, by cluster) ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">二</span> 论文条目</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">相关性达标后按分数取 Top-N（本报 N=…；达标 M 篇）。按本周动态聚类展示。</p>

    <!-- one .cluster-title per direction cluster, with 0..N .card below it -->
    <div class="cluster-title">簇名（中文）· English label（N）</div>

    <div class="card">
      <h3>English Paper Title — 一句话贡献</h3>
      <div class="field">
        <div class="field-label">发生了什么</div>
        <div class="field-value">2-4 句客观说明：问题设定、方法要点、主要结果；不编造未给出的数字。付费 venue 注明基于公开摘要。</div>
      </div>
      <div class="field">
        <div class="field-label">为什么重要</div>
        <div class="field-value">对路线、基准、可复现性或下游系统的影响。</div>
      </div>
      <!-- optional: only when an author statement or thread exists -->
      <div class="field">
        <div class="field-label">作者 / 社区要点</div>
        <blockquote>…</blockquote>
      </div>
      <div class="tags">
        <span class="tag preprint">preprint</span>
        <!-- or class="tag accepted"；付费正式刊可用 accepted + venue 名 -->
        <span class="tag">venue or cs.CL</span>
        <span class="tag">子方向</span>
        <!-- 高 HF 热度时： <span class="tag hot">HF hot</span> -->
      </div>
      <div class="source">
        来源：<a href="https://arxiv.org/abs/..." target="_blank">arXiv</a>
        <!-- 有 DOI / IEEE 摘要页则附加 -->
        &nbsp;|&nbsp; Authors et al. &nbsp;|&nbsp; YYYY-MM-DD
        &nbsp;|&nbsp; cited N · HF↑ N
      </div>
    </div>
  </div>

  <!-- ==================== 3. Method comparison and disagreement ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">三</span> 方法对比与分歧</div>
    <!-- based on this week's paper set; use empty when there is not enough to compare -->
    <div class="summary-block">
      <h4>差异轴</h4>
      <ul>
        <li><strong>轴名</strong>：A 路论文 vs B 路论文；证据指向…</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 4. Acceptance and conference news ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">四</span> 录用与会务动态</div>
    <!-- only verified accept / award / workshop news from this week; otherwise empty -->
    <p class="empty">本周暂无显著录用或会务公告</p>
  </div>

  <!-- ==================== 5. Community interpretation ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">五</span> 社区解读</div>

    <div class="summary-block">
      <h4>共识</h4>
      <p style="font-size:13px;color:var(--muted);margin-bottom:8px">≥2 源指向同一方向；不足则少写，不编造。</p>
      <ul>
        <li><strong>共识主题</strong>：……（来源：<a href="...">…</a>）</li>
      </ul>
    </div>

    <div class="summary-block">
      <h4>质疑与局限</h4>
      <ul>
        <li><strong>焦点</strong>：…</li>
      </ul>
    </div>

    <div class="summary-block">
      <h4>值得引用的原话</h4>
      <blockquote>…</blockquote>
      <div style="font-size:13px;color:var(--muted)">— 姓名/handle — <a href="...">出处</a></div>
    </div>
  </div>

  <!-- ==================== 6. Trends and follow-up ==================== -->
  <div class="section">
    <div class="section-title"><span class="num">六</span> 趋势与持续跟踪</div>

    <div class="summary-block">
      <h4>跨论文信号</h4>
      <ul>
        <li><strong>信号</strong>：为何值得关注（点名本周 ≥2 篇作证据）。</li>
      </ul>
    </div>

    <div class="watch-item">
      <strong>跟踪：</strong>code 是否开源 / camera-ready / 复现结果 / 后续 v2。关注 <em>什么信号</em>。
    </div>
  </div>

</div>
</body>
</html>
```

## Quality standards

- **English papers only**; Chinese titles or Chinese-journal bodies are never included
- Every item has a clickable primary link (arXiv abs first, then DOI, then OpenAlex / Semantic Scholar / IEEE abstract page)
- Prefer items first published or formally recorded with a publication_date after `$SINCE`
- Report body in Chinese; paper titles, terminology, and venue names keep their original English
- **The main list must come from general-purpose subagents' curl APIs**; websearch never serves as the paper enumeration source, and the main agent never batch-curls scholarly APIs itself
- **No static top-conference whitelist**; the venue distribution must come from this week's hit histogram
- **Paywalled sites such as IEEE**: judge from the public abstract (and a strong title) only; never bypass paywalls or invent full-text results; drop when the abstract is missing and the title is ambiguous
- **Output Top-`$TOP_N` after qualification** (default 35, recommended 30–40), organized by direction cluster; never shrink to a hidden smaller Top-K, and never pad to N with low-score items
- When truncation happens, the overview states both "M qualified" and "Top-N reported"
- Exclude: non-English, generic word-level near-misses, missing links, non-paper noise
- A single uncorroborated external interpretation gets a ⚠️ single-source marker at the citation
- When too few items survive filtering or an API failed, say so honestly in `.quality-note`; **never pad with low-value items**
- Stats match the card lists ("included N" = number of cards in section two)
- Write the final HTML with `write`
- Open the HTML preview with `open` when done

## Tool constraints

1. **Main agent**: orchestration only — parse input, start/wait for subagents, merge scores/clusters, write the HTML; **do not** run the arXiv/OpenAlex/HF/S2 collection curls yourself
2. **Collection / verification / gap-filling**: `subagent_type: "general-purpose"` with `bash` + `curl` (`jq` / `python3` parsing); use it whenever network requests and the command line are needed — never fake a list with websearch
3. **Interpretation / trends / community reaction**: `subagent_type: "websearch"`; any missed item must go back to a general-purpose curl agent for verification
4. Never paste raw API JSON/XML into the HTML; filter first, then write cards
5. `sleep 3` between arXiv requests; send a proper `User-Agent` to OpenAlex / S2; mind each API's rate limits
6. When some collection agents fail: continue with the sources you have and note the degradation in `.quality-note`
7. **Never** hardcode a NeurIPS/ICML/IEEE… filter list just to look like a top-conference digest; whether top conferences or IEEE appear is decided entirely by this week's data
8. **Never** download or crack paywalled full texts; the abstract is enough for a card — if it is not, drop the item or state the degradation
