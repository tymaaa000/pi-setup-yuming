/**
 * Provider usage/balance widget (below editor).
 *
 * Mutually exclusive — the active source is decided by the main session
 * model's provider:
 *   deepseek     → DeepSeek account balance (deepseek.ts)
 *   openai-codex → ChatGPT plan usage (chatgpt.ts, wham/usage like codex CLI)
 *
 * Polls every hour; `/usage` refreshes on demand. Warning state (yellow) is
 * abstracted per source via `isWarning(data)`; concrete example: ChatGPT turns
 * yellow when any usage window reaches ≥ 80%.
 *
 * Display:
 *   success:   DeepSeek: 110.00 CNY
 *              ChatGPT free · monthly: 0% · resets in 29d
 *   stale:     <success> (stale)
 *   placeholder / unavailable / empty / error-without-cache: source placeholder (+ error reason)
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { chatgptSource } from "./chatgpt.js";
import { deepseekSource } from "./deepseek.js";
import {
	HttpError,
	INTERVAL_MS,
	type Registry,
	TIMEOUT_MS,
	type Ui,
	type UsageData,
	WIDGET_ID,
	type WidgetSource,
} from "./source.js";

const sources: WidgetSource[] = [deepseekSource, chatgptSource];

// ---------------------------------------------------------------------------
// Dispatcher: one widget, mutually exclusive, follows the session model's provider
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	let ui: Ui | null = null;
	let registry: Registry | null = null;
	let active = false;
	let source: WidgetSource | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let abort: AbortController | null = null;
	let fetchGen = 0;
	/** Last successful UsageData per source (placeholders and stale lines excluded). */
	const caches = new Map<string, UsageData>();
	/** Current render snapshot (theme-free); re-read when the factory renders. */
	let display: { line: string; isWarning: boolean } | null = null;

	function setLine(data: UsageData | undefined) {
		if (!ui) return;
		if (!data || !source) {
			display = null;
			ui.setWidget(WIDGET_ID, undefined);
			return;
		}
		const isWarning = source.isWarning(data);
		display = { line: data.line, isWarning };
		// dim matches the footer token/cost tone; warning renders as a yellow alert.
		ui.setWidget(
			WIDGET_ID,
			(_tui, theme) =>
				new Text(
					theme.fg(isWarning ? "warning" : "dim", display?.line ?? ""),
					0,
					0,
				),
			{ placement: "belowEditor" },
		);
	}

	function showFailure(err?: unknown) {
		if (!active || !source) return;
		const cache = caches.get(source.provider);
		if (cache) {
			setLine({ ...cache, line: `${cache.line} (stale)` });
			return;
		}
		// Without a cache, include a short failure reason for diagnosis
		// (timeout, HTTP 403, TypeError: fetch failed, and so on).
		const reason =
			err instanceof HttpError
				? `HTTP ${err.status}`
				: err instanceof Error &&
						(err.name === "AbortError" || err.name === "TimeoutError")
					? "timeout"
					: err instanceof Error
						? `${err.name}: ${err.message}`.slice(0, 40)
						: "error";
		setLine({ line: `${source.placeholder} (${reason})`, windows: [] });
	}

	function stop() {
		active = false;
		source = null;
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		if (abort) {
			abort.abort();
			abort = null;
		}
		fetchGen++;
		setLine(undefined);
	}

	async function refresh() {
		if (!active || !ui || !registry || !source) return;

		const apiKey = await registry.getApiKeyForProvider(source.provider);
		if (!apiKey) {
			// No credentials: hide the widget and stop polling.
			stop();
			return;
		}

		// First load with no cache: show the placeholder first.
		if (!caches.has(source.provider))
			setLine({ line: source.placeholder, windows: [] });

		if (abort) abort.abort();
		const controller = new AbortController();
		abort = controller;
		const gen = ++fetchGen;

		const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
		try {
			const data = await source.fetch(apiKey, controller.signal);
			if (gen !== fetchGen || !active) return;

			if (data === undefined) {
				// No data: show the placeholder without overwriting the cache.
				setLine({ line: source.placeholder, windows: [] });
				return;
			}

			caches.set(source.provider, data);
			setLine(data);
		} catch (err) {
			// Abort on switch-away is ignored via gen/active checks.
			if (gen !== fetchGen || !active) return;
			// 401 means the token is invalid and a cache is useless; show an actionable hint.
			if (
				err instanceof HttpError &&
				err.status === 401 &&
				source === chatgptSource
			) {
				caches.delete(source.provider);
				setLine({
					line: "ChatGPT: token expired (run /login openai-codex)",
					windows: [],
				});
				return;
			}
			showFailure(err);
		} finally {
			clearTimeout(timeout);
			if (abort === controller) abort = null;
		}
	}

	function start(ctx: ExtensionContext) {
		ui = ctx.ui;
		registry = ctx.modelRegistry;
		active = true;
		// Re-entry with cache: show it immediately while refresh is in flight.
		const cache = source ? caches.get(source.provider) : undefined;
		if (cache) setLine(cache);
		if (timer) clearInterval(timer);
		timer = setInterval(() => {
			void refresh();
		}, INTERVAL_MS);
		void refresh();
	}

	function bindCtx(ctx: ExtensionContext) {
		ui = ctx.ui;
		registry = ctx.modelRegistry;
	}

	function sourceFor(
		model: { provider?: string } | undefined | null,
	): WidgetSource | undefined {
		return sources.find((s) => s.provider === model?.provider);
	}

	// Unsupported provider: do nothing (no refresh, no notice).
	pi.registerCommand("usage", {
		description: "Refresh provider usage/balance widget now",
		handler: async (_args, ctx) => {
			if (!active || !source) return;
			await refresh();
			// Report the latest rendered line (success, stale, or error).
			if (active && display)
				ctx.ui.notify(
					display.line,
					display.isWarning ? "warning" : "info",
				);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		bindCtx(ctx);
		const s = sourceFor(ctx.model);
		if (s) {
			source = s;
			start(ctx);
		} else {
			stop();
		}
	});

	pi.on("model_select", async (event, ctx) => {
		bindCtx(ctx);
		const s = sourceFor(event.model);
		if (s) {
			source = s;
			start(ctx);
		} else {
			stop();
		}
	});

	pi.on("session_shutdown", async () => {
		stop();
		ui = null;
		registry = null;
	});
}
