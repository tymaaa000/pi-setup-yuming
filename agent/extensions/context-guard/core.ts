import { statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface SearchInput {
	limit?: unknown;
	context?: unknown;
}

export interface ReadInput {
	path?: unknown;
	offset?: unknown;
	limit?: unknown;
}

export interface GuardResult {
	block: true;
	reason: string;
}

export const MAX_SEARCH_LIMIT = 20;
export const MAX_SEARCH_CONTEXT = 3;
const MAX_DIRECT_READ_BYTES = 32 * 1024;
const MAX_DIRECT_READ_LINES = 400;
const SEARCH_TOOLS = new Set(["grep", "ffgrep"]);

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Read the caller's line limit. Models occasionally send numbers as strings, so a
 * numeric string counts as a bounded read instead of a false positive.
 */
function boundedLineLimit(input: ReadInput): number | undefined {
	const raw = input.limit;
	const value =
		typeof raw === "number"
			? raw
			: typeof raw === "string" && raw.trim() !== ""
				? Number(raw)
				: Number.NaN;
	if (!Number.isFinite(value) || value <= 0) return undefined;
	return value;
}

/** Expand a leading "~" the way a shell would; path.resolve alone would not. */
export function resolveReadPath(cwd: string, inputPath: string): string {
	if (inputPath === "~") return homedir();
	if (inputPath.startsWith("~/")) {
		return path.join(homedir(), inputPath.slice(2));
	}
	return path.resolve(cwd, inputPath);
}

export function normalizeSearchInput(input: SearchInput): {
	limit?: number;
	context?: number;
} {
	const normalized: { limit?: number; context?: number } = {};
	if (typeof input.limit === "number" && Number.isFinite(input.limit)) {
		normalized.limit = Math.min(Math.max(1, input.limit), MAX_SEARCH_LIMIT);
	}
	if (typeof input.context === "number" && Number.isFinite(input.context)) {
		normalized.context = Math.min(
			Math.max(0, input.context),
			MAX_SEARCH_CONTEXT,
		);
	}
	return normalized;
}

/**
 * Returns a block reason when a read would pull a large file in without a line bound.
 *
 * The budget is a line bound, not an exact byte measurement: a bounded read of a file
 * whose average line is very long (minified bundles, single-line JSON) can still be
 * large. Keeping the rule cheap means the guard never reads the file itself.
 */
export function largeReadReason(
	input: ReadInput,
	fileBytes: number,
): string | undefined {
	if (fileBytes <= MAX_DIRECT_READ_BYTES) return undefined;
	const limit = boundedLineLimit(input);
	if (limit !== undefined && limit <= MAX_DIRECT_READ_LINES) return undefined;

	return [
		`Direct read blocked: an unbounded read of ${formatBytes(fileBytes)} exceeds the ${formatBytes(MAX_DIRECT_READ_BYTES)} direct-read budget.`,
		`Use read with a bounded limit (<= ${MAX_DIRECT_READ_LINES} lines), ffgrep for targeted matches, or a summary workflow.`,
	].join(" ");
}

/**
 * Applies the Context guard to one tool call. Mutates `input` for search tools — Pi
 * guarantees that `tool_call` handlers see and may patch the arguments that will run.
 */
export function guardToolCall(
	toolName: string,
	input: Record<string, unknown>,
	cwd: string,
): GuardResult | undefined {
	if (SEARCH_TOOLS.has(toolName)) {
		Object.assign(input, normalizeSearchInput(input));
		return;
	}
	if (toolName !== "read") return;

	const read = input as ReadInput;
	if (typeof read.path !== "string" || read.path === "") return;

	try {
		const stat = statSync(resolveReadPath(cwd, read.path));
		if (!stat.isFile()) return;
		const reason = largeReadReason(read, stat.size);
		if (reason) return { block: true, reason };
	} catch {
		// Let the built-in read tool report its normal path/error result.
	}
}
