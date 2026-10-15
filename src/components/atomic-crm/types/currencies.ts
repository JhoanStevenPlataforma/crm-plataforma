import type { Identifier } from "ra-core";

/**
 * Currencies & exchange rates (docs/proposals/multi-currency-fx.md).
 *
 * THE RATE CONVENTION, everywhere: `rate` = units of the BASE currency per ONE
 * unit of the currency (USD at 4000 = 1 USD is 4000 COP).
 */

/** `public.currencies`. Keyed by its ISO 4217 code. */
export type Currency = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_active: boolean;
  /** Switched only through `set_base_currency()`. */
  is_base: boolean;
  is_quote_default: boolean;
  created_at?: string;
  updated_at?: string;
};

/** `public.fx_rate_kind`: what a stored rate is. */
export type FxRateKind = "official" | "commercial";

/** `public.quote_rate_kind`: what a quotation version is priced at. */
export type QuoteRateKind = "base" | "official" | "commercial" | "custom";

/** `public.exchange_rates`: append-only history. */
export type ExchangeRate = {
  id: Identifier;
  currency_code: string;
  base_currency_code: string;
  rate: number;
  kind: FxRateKind;
  /** Null for a rate typed by a person. */
  provider_id?: Identifier | null;
  effective_date: string;
  valid_until?: string | null;
  fetched_at: string;
  derived_via?: string | null;
  created_by?: Identifier | null;
  note?: string | null;
  supersedes_id?: Identifier | null;
  created_at?: string;
};

/** `public.current_exchange_rates`: the one place a "current rate" is read. */
export type CurrentExchangeRate = {
  id: string;
  currency_code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_active: boolean;
  is_quote_default: boolean;
  base_currency_code: string;
  official_rate?: number | null;
  official_rate_id?: Identifier | null;
  official_provider_key?: string | null;
  official_provider_name?: string | null;
  official_effective_date?: string | null;
  official_valid_until?: string | null;
  official_fetched_at?: string | null;
  official_age_days?: number | null;
  official_is_stale?: boolean | null;
  commercial_rate?: number | null;
  commercial_rate_id?: Identifier | null;
  commercial_effective_date?: string | null;
  commercial_valid_until?: string | null;
  commercial_diff_percent?: number | null;
};

/** `public.exchange_rate_providers`. The secret itself never reaches a client. */
export type ExchangeRateProvider = {
  id: Identifier;
  key: string;
  name: string;
  description?: string | null;
  is_enabled: boolean;
  priority: number;
  requires_credentials: boolean;
  refresh_interval_minutes: number;
  currencies: string[];
  credentials_secret_id?: string | null;
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  last_error_at?: string | null;
  last_error?: string | null;
  consecutive_failures: number;
};

/** `public.exchange_rate_settings` (singleton, id 1). */
export type ExchangeRateSettings = {
  id: number;
  quote_rate_kind_default: FxRateKind;
  stale_after_days: number;
  rep_custom_rate_tolerance_percent: number;
  failure_alert_threshold: number;
  updated_at?: string;
};

export type ExchangeRateSyncRun = {
  id: Identifier;
  provider_id: Identifier;
  triggered_by: "cron" | "manual" | "backfill";
  triggered_by_sales_id?: Identifier | null;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at?: string | null;
  attempts: number;
  rates_received: number;
  rates_inserted: number;
  rates_rejected: number;
  error?: string | null;
};

export type ExchangeRateAuditLog = {
  id: Identifier;
  occurred_at: string;
  sales_id?: Identifier | null;
  entity: "currency" | "provider" | "settings" | "rate" | "quote_version";
  entity_key: string;
  action: string;
  field?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  note?: string | null;
};

export type FxProviderStatus = "operational" | "degraded" | "down" | "disabled";

/** One provider in `fx_integration_health()`. */
export type FxProviderHealth = {
  key: string;
  name: string;
  is_enabled: boolean;
  priority: number;
  refresh_interval_minutes: number;
  currencies: string[];
  requires_credentials: boolean;
  has_credentials: boolean;
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  last_error_at?: string | null;
  last_error?: string | null;
  consecutive_failures: number;
  rates_imported_last_run?: number | null;
  rates_imported_30d: number;
  errors_30d: number;
  history_from?: string | null;
  is_running: boolean;
  status: FxProviderStatus;
};

/** `fx_integration_health()`: the health panel's one read. */
export type FxIntegrationHealth = {
  checked_at: string;
  base_currency: string;
  stale_after_days: number;
  auto_sync: {
    job_exists: boolean;
    job_active: boolean;
    schedule?: string | null;
    secrets_configured: boolean;
    active: boolean;
  };
  providers: FxProviderHealth[];
  history: {
    available: boolean;
    rates: number;
    from?: string | null;
    to?: string | null;
  };
  oldest_rate_in_use?: {
    effective_date: string;
    currency: string;
    kind: string;
    source: "current_rate" | "draft_quote";
    quote_id?: Identifier | null;
    is_stale: boolean;
  } | null;
  active_currencies: number;
  currencies_without_rate: string[];
};

/** What one provider's run ended as, from the sync function. */
export type FxSyncOutcome =
  | { provider: string; status: "skipped"; reason: string }
  | {
      provider: string;
      status: "succeeded" | "failed";
      runId: number;
      attempts: number;
      received?: number;
      inserted?: number;
      rejected?: number;
      error?: string;
    };

/**
 * The rate a line priced in another currency converts at, and which
 * observation it is (`fx_line_source_rate()`): what the picker previews is
 * what the server stores.
 */
export type LineSourceRate = {
  rate: number;
  exchange_rate_id: Identifier | null;
  kind: string | null;
  effective_date: string | null;
  valid_until: string | null;
  is_stale: boolean;
};

/** The rate frozen on a document, as the portal payload and the print carry it. */
export type QuoteExchangeInfo = {
  base_currency: string;
  rate: number;
  rate_kind: QuoteRateKind;
  provider_name?: string | null;
  effective_date?: string | null;
  total_base?: number | null;
};
