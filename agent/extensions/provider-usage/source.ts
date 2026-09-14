/**
 * Shared widget-source abstraction for the provider usage/balance widget.
 *
 * The widget is mutually exclusive: exactly one source is active at a time,
 * decided by the main session model's provider (see index.ts). Each source
 * knows how to fetch its data and whether it has reached a warning state
 * (rendered in yellow via `isWarning(data)`).
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const WIDGET_ID = "provider-usage";
// Poll every hour; use /usage to refresh on demand.
export const INTERVAL_MS = 60 * 60 * 1000;
// A proxied request measured ~4.7s (cold EnvHttpProxyAgent connection); 5s reliably
// times out, so 15s leaves headroom.
export const TIMEOUT_MS = 15 * 1000;

export type Ui = ExtensionContext["ui"];
export type Registry = ExtensionContext["modelRegistry"];

/** Result of one fetch: the display line plus window data used by isWarning. */
export type UsageData = {
	line: string;
	windows: { label: string; percent: number }[];
	/** Balance amounts per currency (for example the DeepSeek balance), used by isWarning. */
	amounts?: number[];
};

/** One source per provider; the widget is mutually exclusive and follows the model provider. */
export interface WidgetSource {
	provider: string;
	/** Placeholder line for the first load or when no data is available. */
	placeholder: string;
	fetch(apiKey: string, signal: AbortSignal): Promise<UsageData | undefined>;
	/** Reached a warning state: render in yellow (each source decides). */
	isWarning(data: UsageData): boolean;
}

export class HttpError extends Error {
	constructor(public status: number) {
		super(`HTTP ${status}`);
	}
}
