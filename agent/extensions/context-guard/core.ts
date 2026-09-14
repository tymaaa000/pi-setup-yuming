interface ReadInput {
	path?: unknown;
	offset?: unknown;
	limit?: unknown;
}

export interface SearchInput {
	limit?: unknown;
	context?: unknown;
}

export const MAX_SEARCH_LIMIT = 20;
export const MAX_SEARCH_CONTEXT = 3;
const MAX_DIRECT_READ_BYTES = 32 * 1024;
const MAX_DIRECT_READ_LINES = 400;

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
