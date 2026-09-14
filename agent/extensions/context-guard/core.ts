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

export function largeReadReason(
	input: ReadInput,
	fileBytes: number,
): string | undefined {
	if (fileBytes <= MAX_DIRECT_READ_BYTES) return undefined;
	if (
		typeof input.limit === "number" &&
		input.limit > 0 &&
		input.limit <= MAX_DIRECT_READ_LINES
	) {
		return undefined;
	}

	return [
		`Direct read blocked: ${formatBytes(fileBytes)} exceeds the ${formatBytes(MAX_DIRECT_READ_BYTES)} direct-read budget.`,
		"Use read with a bounded offset/limit, ffgrep for targeted matches, or a summary workflow.",
	].join(" ");
}
