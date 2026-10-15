import { decimalString } from "./decimal.ts";
import type { RateItem, RateProvider } from "./types.ts";

/**
 * The TRM (Tasa Representativa del Mercado): the official USD/COP rate,
 * certified by the Superintendencia Financiera de Colombia and published on
 * datos.gov.co (Socrata dataset `32sa-8pi3`). No credentials.
 *
 * Each row covers `vigenciadesde`..`vigenciahasta`; a weekend's TRM is one row
 * over several days, which is why `valid_until` is carried: a TRM still in
 * force on Monday is not stale on Monday.
 */
export const TRM_DEFAULT_URL =
  "https://www.datos.gov.co/resource/32sa-8pi3.json";

type TrmRow = {
  valor?: unknown;
  unidad?: unknown;
  vigenciadesde?: unknown;
  vigenciahasta?: unknown;
};

const day = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 10) : "";

export const buildTrmUrl = (
  baseUrl: string,
  range: { from?: string; to?: string },
) => {
  const params = new URLSearchParams({
    $select: "valor,unidad,vigenciadesde,vigenciahasta",
    $order: "vigenciadesde DESC",
  });
  if (range.from && range.to) {
    params.set(
      "$where",
      `vigenciadesde between '${range.from}T00:00:00' and '${range.to}T00:00:00'`,
    );
    params.set("$limit", "1000");
  } else {
    // Today's, tomorrow's (published the afternoon before) and a margin.
    params.set("$limit", "5");
  }
  return `${baseUrl}?${params.toString()}`;
};

export const parseTrmRows = (payload: unknown): RateItem[] => {
  if (!Array.isArray(payload)) {
    throw new Error("TRM: the response is not a list of rows");
  }
  return (payload as TrmRow[]).map((row) => ({
    currency: "USD",
    quote_currency:
      typeof row.unidad === "string" && row.unidad.trim()
        ? row.unidad.trim().toUpperCase()
        : "COP",
    // An unreadable value is passed on as empty and rejected, with the row,
    // rather than dropped here where nobody would see it.
    rate: decimalString(row.valor) ?? "",
    effective_date: day(row.vigenciadesde),
    valid_until: day(row.vigenciahasta) || null,
    raw: row,
  }));
};

export const createTrmProvider = (
  baseUrl: string = TRM_DEFAULT_URL,
): RateProvider => ({
  key: "trm_co",
  fetchRates: async (request, fetchJson) => {
    if (!request.currencies.includes("USD")) {
      return [];
    }
    return parseTrmRows(await fetchJson(buildTrmUrl(baseUrl, request)));
  },
});
