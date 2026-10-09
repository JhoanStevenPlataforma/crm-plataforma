import { decimalString } from "./decimal.ts";
import type { RateItem, RateProvider } from "./types.ts";

/**
 * European Central Bank reference rates through Frankfurter
 * (https://frankfurter.dev). No credentials, history back to 1999.
 *
 * Asked "from USD", so every item reads "1 USD = x <currency>". The ECB does
 * not publish COP, so `fx_record_rates()` crosses each item into the base
 * through the official USD rate in force ON THE SAME DAY (the TRM) -- which is
 * why this provider has a higher priority number than `trm_co` and runs after
 * it.
 */
export const FRANKFURTER_DEFAULT_URL = "https://api.frankfurter.dev/v1";
const PIVOT = "USD";

type FrankfurterLatest = { date?: unknown; rates?: Record<string, unknown> };
type FrankfurterRange = { rates?: Record<string, Record<string, unknown>> };

export const buildFrankfurterUrl = (
  baseUrl: string,
  symbols: string[],
  range: { from?: string; to?: string },
) => {
  const path = range.from && range.to ? `${range.from}..${range.to}` : "latest";
  const params = new URLSearchParams({ from: PIVOT, to: symbols.join(",") });
  return `${baseUrl}/${path}?${params.toString()}`;
};

const itemsForDay = (
  date: string,
  rates: Record<string, unknown>,
): RateItem[] =>
  Object.entries(rates).map(([code, value]) => ({
    currency: PIVOT,
    quote_currency: code.toUpperCase(),
    rate: decimalString(value) ?? "",
    effective_date: date,
    valid_until: null,
    raw: { date, code, value },
  }));

export const parseFrankfurter = (payload: unknown): RateItem[] => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Frankfurter: the response is not an object");
  }
  const rates = (payload as FrankfurterLatest).rates;
  if (!rates || typeof rates !== "object") {
    throw new Error("Frankfurter: the response has no rates");
  }

  const date = (payload as FrankfurterLatest).date;
  if (typeof date === "string") {
    return itemsForDay(date, rates);
  }
  // A range: { "2026-09-24": { "EUR": 0.87 }, ... }
  return Object.entries((payload as FrankfurterRange).rates ?? {}).flatMap(
    ([day, dayRates]) =>
      dayRates && typeof dayRates === "object"
        ? itemsForDay(day, dayRates)
        : [],
  );
};

export const createFrankfurterProvider = (
  baseUrl: string = FRANKFURTER_DEFAULT_URL,
): RateProvider => ({
  key: "ecb_frankfurter",
  fetchRates: async (request, fetchJson) => {
    const symbols = request.currencies.filter((code) => code !== PIVOT);
    if (symbols.length === 0) {
      return [];
    }
    return parseFrankfurter(
      await fetchJson(buildFrankfurterUrl(baseUrl, symbols, request)),
    );
  },
});
