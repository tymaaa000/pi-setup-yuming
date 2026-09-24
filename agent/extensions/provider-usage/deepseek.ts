/**
 * DeepSeek balance source — https://api.deepseek.com/user/balance
 */

import { HttpError, type WidgetSource } from "./source.js";

const DEEPSEEK_PROVIDER = "deepseek";
const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";
const DEEPSEEK_PLACEHOLDER = "DeepSeek: 0 CNY";
/** Warning threshold: any currency balance below this amount renders in yellow. */
const DEEPSEEK_WARNING_AMOUNT = 20;

type BalanceInfo = {
  currency: string;
  total_balance: string;
};

type BalanceResponse = {
  is_available: boolean;
  balance_infos?: BalanceInfo[];
};

export const deepseekSource: WidgetSource = {
  provider: DEEPSEEK_PROVIDER,
  placeholder: DEEPSEEK_PLACEHOLDER,
  async fetch(apiKey, signal) {
    const res = await fetch(DEEPSEEK_BALANCE_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
    });
    if (!res.ok) throw new HttpError(res.status);

    const data = (await res.json()) as BalanceResponse;
    // is_available:false means no data: show the placeholder without overwriting the cache.
    if (!data.is_available) return undefined;
    const infos = data.balance_infos ?? [];
    if (infos.length === 0) return undefined;

    const line = `DeepSeek: ${infos.map((i) => `${i.total_balance} ${i.currency}`).join(" | ")}`;
    // Amounts feed isWarning (balance below the threshold turns yellow).
    const amounts = infos
      .map((i) => Number(i.total_balance))
      .filter((n) => Number.isFinite(n));
    return { line, windows: [], amounts };
  },
  // Any currency balance below the threshold turns the widget yellow.
  isWarning: (data) =>
    (data.amounts ?? []).some((a) => a < DEEPSEEK_WARNING_AMOUNT),
};
