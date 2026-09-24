/**
 * Human-readable failure reasons for the usage widget.
 *
 * Node's fetch collapses every network failure — DNS, connect, TLS — into the same
 * generic `TypeError: fetch failed` and keeps the real reason in `err.cause`
 * (ECONNRESET, ENOTFOUND, UND_ERR_CONNECT_TIMEOUT, …). Unwrap that chain, including
 * the AggregateError undici throws after trying several addresses, so a first-load
 * failure explains itself instead of stopping at "fetch failed".
 */

import { HttpError } from "./source.js";

/** Cap for the reason shown next to the widget placeholder. */
const REASON_MAX = 48;
/** Depth limit while unwrapping `err.cause` chains. */
const CAUSE_MAX_DEPTH = 3;

function describeCause(cause: unknown, depth = 0): string | undefined {
  if (depth > CAUSE_MAX_DEPTH || cause === null || cause === undefined)
    return undefined;
  if (cause instanceof AggregateError) {
    const reasons = cause.errors
      .map((error) => describeCause(error, depth + 1))
      .filter((reason): reason is string => reason !== undefined);
    const unique = [...new Set(reasons)];
    if (unique.length > 0) return unique.join("/");
  }
  if (typeof cause !== "object") return undefined;
  // Error codes are short and stable; a message is the fallback when none exists.
  const code = (cause as { code?: unknown }).code;
  if (typeof code === "string" && code.length > 0) return code;
  if (cause instanceof Error) {
    const message = cause.message.split("\n")[0].trim();
    if (message.length > 0) return message;
    return describeCause(cause.cause, depth + 1);
  }
  return undefined;
}

/**
 * Short failure reason for the placeholder line: HTTP status, timeout, or the
 * underlying network cause (`TypeError: fetch failed [ECONNRESET]`).
 */
export function failureReason(err: unknown): string {
  if (err instanceof HttpError) return `HTTP ${err.status}`;
  if (
    err instanceof Error &&
    (err.name === "AbortError" || err.name === "TimeoutError")
  )
    return "timeout";
  if (!(err instanceof Error)) return "error";
  const cause = describeCause(err.cause);
  const base = `${err.name}: ${err.message}`;
  return (cause ? `${base} [${cause}]` : base).slice(0, REASON_MAX);
}
