import { errorMessageForCode, WebSearchError } from "../../core/errors.ts";
import type {
  SearchProvider,
  SearchRequest,
  SearchResult,
} from "../../core/types.ts";
import {
  type FetchLike,
  fetchJson,
  validateTimeout,
  withSearchDeadline,
} from "../../shared/http.ts";
import { DEFAULT_SEARCH_TIMEOUT_MS } from "../../shared/limits.ts";
import {
  isRecord,
  normalizeSearchResponse,
  stringField,
} from "../../shared/results.ts";
import {
  normalizeTavilyApiKey,
  normalizeTavilyBaseUrl,
  TAVILY_DEFAULT_SEARCH_DEPTH,
  TAVILY_MAX_RESULTS,
  TAVILY_QUOTA_STATUSES,
} from "./config.ts";

export interface TavilyProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
}

/** Tavily only exposes coarse recency windows for general searches. */
function timeRangeFor(days: number): "d" | "w" | "m" | "y" {
  return days <= 1 ? "d" : days <= 7 ? "w" : days <= 31 ? "m" : "y";
}

export function buildTavilyPayload(
  request: SearchRequest,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    query: request.query,
    max_results: Math.min(request.maxResults, TAVILY_MAX_RESULTS),
    search_depth: TAVILY_DEFAULT_SEARCH_DEPTH,
    include_answer: true,
    include_raw_content: false,
  };
  if (request.domains?.length) {
    payload.include_domains = [...request.domains];
  }
  if (request.recencyDays !== undefined) {
    payload.time_range = timeRangeFor(request.recencyDays);
  }
  return payload;
}

function* parseResults(raw: unknown): Iterable<SearchResult> {
  if (!isRecord(raw) || !Array.isArray(raw.results)) {
    throw new WebSearchError(
      "invalid-response",
      "Tavily returned an invalid response.",
      { provider: "tavily" },
    );
  }
  for (const item of raw.results) {
    if (!isRecord(item)) continue;
    yield {
      title: stringField(item, "title"),
      url: stringField(item, "url"),
      snippet: stringField(item, "content", "snippet", "description"),
    };
  }
}

function summaryOf(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  const answer = raw.answer;
  return typeof answer === "string" && answer.trim() ? answer : undefined;
}

/** Quota exhaustion must stay fallback-eligible, so 432/433 become rate limits. */
function classifyTavilyError(error: unknown): unknown {
  if (
    error instanceof WebSearchError &&
    typeof error.status === "number" &&
    (TAVILY_QUOTA_STATUSES as readonly number[]).includes(error.status)
  ) {
    return new WebSearchError(
      "rate-limit",
      errorMessageForCode("rate-limit", "tavily"),
      { provider: "tavily", status: error.status },
    );
  }
  return error;
}

export function createTavilyProvider(
  options: TavilyProviderOptions = {},
): SearchProvider {
  const baseUrl = normalizeTavilyBaseUrl(options.baseUrl);
  const apiKey = normalizeTavilyApiKey(options.apiKey);
  if (!apiKey) {
    throw new WebSearchError(
      "invalid-config",
      "Tavily API key is not configured.",
      { provider: "tavily" },
    );
  }
  const timeoutMs = validateTimeout(
    options.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS,
  );
  const fetcher = options.fetch ?? globalThis.fetch;
  return {
    async search(request, signal) {
      return withSearchDeadline(
        "tavily",
        timeoutMs,
        signal,
        async (deadline) => {
          const headers = new Headers({
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          });
          let raw: unknown;
          try {
            raw = await fetchJson(fetcher, "tavily", baseUrl, {
              method: "POST",
              headers,
              body: JSON.stringify(buildTavilyPayload(request)),
              signal: deadline,
            });
          } catch (error) {
            throw classifyTavilyError(error);
          }
          return normalizeSearchResponse(
            request,
            parseResults(raw),
            summaryOf(raw),
            [apiKey],
          );
        },
      );
    },
  };
}
