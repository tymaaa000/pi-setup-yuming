/**
 * Kimi/Moonshot account balance widget (below editor).
 *
 * Only active when the current model provider is "moonshotai" or "moonshotai-cn".
 * Polls the Moonshot balance API every 10 minutes.
 *
 * Display:
 *   success: Kimi: 49.59 CNY[ | 3.00 USD...]
 *   stale:   <success> (stale)
 *   placeholder / unavailable / empty / error-without-cache: Kimi: 0 CNY/USD
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const PROVIDERS = ["moonshotai", "moonshotai-cn"] as const;
type Provider = (typeof PROVIDERS)[number];

const BALANCE_URLS: Record<Provider, string> = {
	moonshotai: "https://api.moonshot.ai/v1/users/me/balance",
	"moonshotai-cn": "https://api.moonshot.cn/v1/users/me/balance",
};

const CURRENCY: Record<Provider, string> = {
	moonshotai: "USD",
	"moonshotai-cn": "CNY",
};

const WIDGET_ID = "kimi-balance";
const INTERVAL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 5000;

interface BalanceData {
	available_balance: number;
	voucher_balance: number;
	cash_balance: number;
}

interface BalanceResponse {
	code: number;
	data: BalanceData;
	scode: string;
	status: boolean;
}

type Ui = ExtensionContext["ui"];
type Registry = ExtensionContext["modelRegistry"];

export default function (pi: ExtensionAPI) {
	let ui: Ui | null = null;
	let registry: Registry | null = null;
	let active = false;
	let currentProvider: Provider | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let abort: AbortController | null = null;
	let fetchGen = 0;
	/** Last successful non-placeholder line, e.g. "Kimi: 49.59 CNY". */
	let cache: string | null = null;
	/** Current display text (without theme); factory re-reads this on render. */
	let display: string | null = null;

	function setLine(line: string | undefined) {
		if (!ui) return;
		if (line === undefined) {
			display = null;
			ui.setWidget(WIDGET_ID, undefined);
			return;
		}
		display = line;
		ui.setWidget(
			WIDGET_ID,
			(_tui, theme) => new Text(theme.fg("dim", display!), 0, 0),
			{ placement: "belowEditor" },
		);
	}

	function formatSuccess(provider: Provider, balance: BalanceData): string {
		return `Kimi: ${balance.available_balance.toFixed(2)} ${CURRENCY[provider]}`;
	}

	function getPlaceholder(provider: Provider): string {
		return `Kimi: 0 ${CURRENCY[provider]}`;
	}

	function showFailure(provider: Provider) {
		if (!active) return;
		if (cache) setLine(`${cache} (stale)`);
		else setLine(getPlaceholder(provider));
	}

	function stop() {
		active = false;
		currentProvider = null;
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
		if (!active || !ui || !registry || !currentProvider) return;

		const provider = currentProvider;
		const apiKey = await registry.getApiKeyForProvider(provider);
		if (!apiKey) {
			stop();
			return;
		}

		// First load / no cache yet: show placeholder immediately.
		if (cache === null) setLine(getPlaceholder(provider));

		if (abort) abort.abort();
		const controller = new AbortController();
		abort = controller;
		const gen = ++fetchGen;

		const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
		try {
			const res = await fetch(BALANCE_URLS[provider], {
				method: "GET",
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				signal: controller.signal,
			});

			if (gen !== fetchGen || !active) return;

			if (!res.ok) {
				showFailure(provider);
				return;
			}

			let data: BalanceResponse;
			try {
				data = (await res.json()) as BalanceResponse;
			} catch {
				if (gen !== fetchGen || !active) return;
				showFailure(provider);
				return;
			}

			if (gen !== fetchGen || !active) return;

			// code !== 0 indicates an error.
			if (data.code !== 0 || !data.data) {
				setLine(getPlaceholder(provider));
				return;
			}

			const line = formatSuccess(provider, data.data);
			cache = line;
			setLine(line);
		} catch {
			if (gen !== fetchGen || !active) return;
			showFailure(provider);
		} finally {
			clearTimeout(timeout);
			if (abort === controller) abort = null;
		}
	}

	function start(ctx: ExtensionContext, provider: Provider) {
		ui = ctx.ui;
		registry = ctx.modelRegistry;

		// Reset cache when switching providers (ai vs cn, different currencies)
		if (currentProvider !== provider) {
			cache = null;
		}
		currentProvider = provider;
		active = true;

		// Re-entry with cache: show it immediately while refresh is in flight.
		if (cache) setLine(cache);
		if (timer) clearInterval(timer);
		timer = setInterval(() => {
			void refresh();
		}, INTERVAL_MS);
		void refresh();
	}

	function isKimiProvider(provider: string | undefined | null): provider is Provider {
		return provider != null && PROVIDERS.includes(provider as Provider);
	}

	function bindCtx(ctx: ExtensionContext) {
		ui = ctx.ui;
		registry = ctx.modelRegistry;
	}

	pi.on("session_start", async (_event, ctx) => {
		bindCtx(ctx);
		const provider = ctx.model?.provider;
		if (isKimiProvider(provider)) start(ctx, provider);
		else stop();
	});

	pi.on("model_select", async (event, ctx) => {
		bindCtx(ctx);
		const provider = event.model?.provider;
		if (isKimiProvider(provider)) {
			start(ctx, provider);
		} else stop();
	});

	pi.on("session_shutdown", async () => {
		stop();
		ui = null;
		registry = null;
	});
}
