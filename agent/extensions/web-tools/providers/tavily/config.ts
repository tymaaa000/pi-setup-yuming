import { WebSearchError } from "../../core/errors.ts";
import { isSafeHeaderValue } from "../../shared/http.ts";

/** Tavily REST search endpoint: one POST per query, key in the Authorization header. */
export const TAVILY_DEFAULT_URL = "https://api.tavily.com/search";
/** Basic depth costs one credit per search; advanced costs two. */
export const TAVILY_DEFAULT_SEARCH_DEPTH = "basic";
/** Tavily accepts up to 20 results per request; callers are capped at 10. */
export const TAVILY_MAX_RESULTS = 20;
/** Tavily reports plan and pay-as-you-go quota exhaustion as 432/433, not 429. */
export const TAVILY_QUOTA_STATUSES = [432, 433] as const;

export function normalizeTavilyBaseUrl(raw = TAVILY_DEFAULT_URL): string {
  try {
    const url = new URL(raw.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      raw.length > 2_048
    )
      throw new Error();
    return url.toString();
  } catch {
    throw new WebSearchError(
      "invalid-config",
      "Tavily URL must be HTTP(S), without credentials, query or fragment.",
      { provider: "tavily" },
    );
  }
}

/**
 * Missing or malformed keys resolve to `undefined` so a broken secret can never
 * take down extension startup; the provider reports `invalid-config` when used.
 */
export function normalizeTavilyApiKey(raw?: string): string | undefined {
  const key = raw?.trim();
  if (!key || !isSafeHeaderValue(key, 512)) return undefined;
  return key;
}
