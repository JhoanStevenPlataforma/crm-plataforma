/**
 * One quote as a source states it: "1 `currency` = `rate` `quote_currency`"
 * on `effective_date`. Never converted here: `fx_record_rates()` turns it into
 * the base convention, so the arithmetic lives in one place and pgTAP pins it.
 *
 * `rate` travels as a decimal STRING. A JavaScript number would round the
 * source's own figure before it reached a `numeric` column.
 */
export type RateItem = {
  currency: string;
  quote_currency: string;
  rate: string;
  effective_date: string;
  valid_until?: string | null;
  raw?: unknown;
};

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type FetchJson = (url: string) => Promise<unknown>;

export type ProviderRequest = {
  /** The currencies the provider row asks for. */
  currencies: string[];
  /** The company's base currency. */
  base: string;
  /** Inclusive ISO dates for a historical backfill; both absent = latest. */
  from?: string;
  to?: string;
  /** Vault secret, for providers that need one. */
  credentials?: string | null;
};

/**
 * A rate source. Adding one is a file implementing this plus a row in
 * `public.exchange_rate_providers` with the same key -- nothing in the sync
 * or in the CRM changes.
 */
export type RateProvider = {
  key: string;
  fetchRates: (
    request: ProviderRequest,
    fetchJson: FetchJson,
  ) => Promise<RateItem[]>;
};
