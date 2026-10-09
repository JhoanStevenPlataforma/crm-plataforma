/**
 * Currencies & exchange rates, demo-side (docs/proposals/multi-currency-fx.md).
 *
 * The mirror of `fx_resolve_rate()`, `quote_lines_fx_convert`, the base totals
 * of `refresh_quote_version_totals()`, the `current_exchange_rates` view and
 * `set_quote_version_rate()`. Same rules, same refusal keys, so a screen
 * behaves the same against either backend. What demo mode cannot do is reach
 * a provider: there is no edge function in a browser tab, and the health
 * report says so instead of pretending.
 */

import type { DataProvider, Identifier, ResourceCallbacks } from "ra-core";

import { serverToday } from "../../currencies/fxFormat";
import { rateIsStale, toBase } from "../../currencies/fxMath";
import type {
  Currency,
  CurrentExchangeRate,
  ExchangeRate,
  ExchangeRateProvider,
  ExchangeRateSettings,
  FxRateKind,
  Quote,
  QuoteRateKind,
  QuoteVersion,
} from "../../types";
import { QuoteRpcError } from "../commons/quoteRpc";
import type { FxMethods } from "../supabase/fxMethods";

const ALL = { page: 1, perPage: 1000 };
const BY_ID = { field: "id", order: "ASC" } as const;

/** What every demo-only refusal says: the screen renders this key. */
export const FX_DEMO_UNAVAILABLE = "crm.fx.demo_unavailable";

export const listAll = async <T>(
  dataProvider: DataProvider,
  resource: string,
  filter: Record<string, unknown> = {},
): Promise<T[]> =>
  (
    await dataProvider.getList(resource, {
      pagination: ALL,
      sort: BY_ID,
      filter,
    })
  ).data as T[];

/** The demo backend's `current_date`: the same day the screens reason on. */
export const today = serverToday;

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );

export function refuse(key: string, message: string): never {
  throw new QuoteRpcError(message, key as never);
}

export type ResolvedRate = {
  rate: number;
  exchange_rate_id: Identifier | null;
  kind: "base" | "official" | "commercial";
  provider_key: string | null;
  effective_date: string;
  valid_until: string | null;
  is_stale: boolean;
};

export type FxContext = {
  currencies: Currency[];
  rates: ExchangeRate[];
  providers: ExchangeRateProvider[];
  settings: ExchangeRateSettings;
};

const DEFAULT_SETTINGS: ExchangeRateSettings = {
  id: 1,
  quote_rate_kind_default: "commercial",
  stale_after_days: 3,
  rep_custom_rate_tolerance_percent: 0,
  failure_alert_threshold: 3,
};

/**
 * A collection a dataset never declared reads as empty: stories and tests
 * seed only what they exercise, and a quote test must not need a currency
 * catalogue to issue a quotation in the base currency.
 */
const listOrEmpty = async <T>(
  dataProvider: DataProvider,
  resource: string,
): Promise<T[]> => {
  try {
    return await listAll<T>(dataProvider, resource);
  } catch {
    return [];
  }
};

export const loadContext = async (
  dataProvider: DataProvider,
): Promise<FxContext> => {
  const [currencies, rates, providers, settings] = await Promise.all([
    listOrEmpty<Currency>(dataProvider, "currencies"),
    listOrEmpty<ExchangeRate>(dataProvider, "exchange_rates"),
    listOrEmpty<ExchangeRateProvider>(dataProvider, "exchange_rate_providers"),
    listOrEmpty<ExchangeRateSettings>(dataProvider, "exchange_rate_settings"),
  ]);
  return {
    currencies,
    rates,
    providers,
    settings: settings[0] ?? DEFAULT_SETTINGS,
  };
};

export const baseOf = (context: FxContext) =>
  context.currencies.find((currency) => currency.is_base)?.code ?? "COP";

export const decimalsOf = (
  context: FxContext,
  code: string | null | undefined,
) =>
  context.currencies.find((currency) => currency.code === code)?.decimals ?? 2;

/** `fx_rate_is_stale()` on the demo's settings: the one rule (`fxMath.ts`). */
export const staleIn = (
  context: FxContext,
  kind: string | null | undefined,
  effectiveDate: string | null | undefined,
  validUntil: string | null | undefined,
  on: string = today(),
): boolean =>
  rateIsStale({
    kind,
    effectiveDate,
    validUntil,
    on,
    staleAfterDays: context.settings.stale_after_days,
  });

/** `fx_resolve_rate()`, the same ordering and the same staleness rule. */
export const resolveRate = (
  context: FxContext,
  currency: string,
  kind: FxRateKind,
  on: string = today(),
): ResolvedRate | null => {
  if (currency === baseOf(context)) {
    return {
      rate: 1,
      exchange_rate_id: null,
      kind: "base",
      provider_key: null,
      effective_date: on,
      valid_until: null,
      is_stale: false,
    };
  }

  const byNewest = (a: ExchangeRate, b: ExchangeRate) =>
    b.effective_date.localeCompare(a.effective_date) ||
    Number(b.id) - Number(a.id);

  if (kind === "commercial") {
    const commercial = context.rates
      .filter(
        (rate) =>
          rate.currency_code === currency &&
          rate.kind === "commercial" &&
          rate.effective_date <= on &&
          (rate.valid_until == null || rate.valid_until >= on),
      )
      .sort(byNewest)[0];
    if (commercial) {
      return {
        rate: Number(commercial.rate),
        exchange_rate_id: commercial.id,
        kind: "commercial",
        provider_key: null,
        effective_date: commercial.effective_date,
        valid_until: commercial.valid_until ?? null,
        is_stale: staleIn(
          context,
          "commercial",
          commercial.effective_date,
          commercial.valid_until,
          on,
        ),
      };
    }
  }

  const priorityOf = (rate: ExchangeRate) =>
    rate.provider_id == null
      ? -1
      : (context.providers.find((p) => p.id === rate.provider_id)?.priority ??
        100);
  const official = context.rates
    .filter(
      (rate) =>
        rate.currency_code === currency &&
        rate.kind === "official" &&
        rate.effective_date <= on,
    )
    .sort(
      (a, b) =>
        b.effective_date.localeCompare(a.effective_date) ||
        priorityOf(a) - priorityOf(b) ||
        Number(b.id) - Number(a.id),
    )[0];
  if (!official) return null;

  return {
    rate: Number(official.rate),
    exchange_rate_id: official.id,
    kind: "official",
    provider_key:
      context.providers.find((p) => p.id === official.provider_id)?.key ?? null,
    effective_date: official.effective_date,
    valid_until: official.valid_until ?? null,
    is_stale: staleIn(
      context,
      "official",
      official.effective_date,
      official.valid_until,
      on,
    ),
  };
};

/** The base currency, as the demo catalogue says (COP when it says nothing). */
export const demoBaseCurrency = async (
  dataProvider: DataProvider,
): Promise<string> => baseOf(await loadContext(dataProvider));

/** The rate columns a new draft starts with (`quote_versions_before_insert`). */
export const defaultVersionRate = async (
  dataProvider: DataProvider,
  currency: string,
): Promise<Partial<QuoteVersion>> => {
  const context = await loadContext(dataProvider);
  const base = baseOf(context);
  if (currency === base) {
    return {
      base_currency: base,
      rate_kind: "base",
      exchange_rate: 1,
      rate_effective_date: today(),
    };
  }
  const resolved = resolveRate(
    context,
    currency,
    context.settings.quote_rate_kind_default,
  );
  return resolved
    ? {
        base_currency: base,
        rate_kind: resolved.kind as QuoteRateKind,
        exchange_rate: resolved.rate,
        exchange_rate_id: resolved.exchange_rate_id,
        rate_provider_key: resolved.provider_key,
        rate_effective_date: resolved.effective_date,
      }
    : {
        base_currency: base,
        rate_kind: null,
        exchange_rate: null,
      };
};

/** The `*_base` columns `refresh_quote_version_totals()` writes. */
export const baseTotals = async (
  dataProvider: DataProvider,
  version: Pick<QuoteVersion, "exchange_rate" | "base_currency">,
  totals: {
    subtotal: number;
    discount_total: number;
    tax_total: number;
    total: number;
  },
): Promise<Partial<QuoteVersion>> => {
  if (version.exchange_rate == null) {
    return {
      subtotal_base: null,
      discount_total_base: null,
      tax_total_base: null,
      total_base: null,
    };
  }
  const context = await loadContext(dataProvider);
  const decimals = decimalsOf(
    context,
    version.base_currency ?? baseOf(context),
  );
  const rate = Number(version.exchange_rate);
  return {
    subtotal_base: toBase(totals.subtotal, rate, decimals),
    discount_total_base: toBase(totals.discount_total, rate, decimals),
    tax_total_base: toBase(totals.tax_total, rate, decimals),
    total_base: toBase(totals.total, rate, decimals),
  };
};

/** The `current_exchange_rates` view. */
export const getCurrentExchangeRates = async (
  dataProvider: DataProvider,
): Promise<CurrentExchangeRate[]> => {
  const context = await loadContext(dataProvider);
  const base = baseOf(context);
  return context.currencies
    .filter((currency) => !currency.is_base)
    .map((currency) => {
      const official = resolveRate(context, currency.code, "official");
      const commercial = resolveRate(context, currency.code, "commercial");
      const hasCommercial = commercial?.kind === "commercial";
      const officialRow = context.rates.find(
        (rate) => rate.id === official?.exchange_rate_id,
      );
      return {
        id: currency.code,
        currency_code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        decimals: currency.decimals,
        is_active: currency.is_active,
        is_quote_default: currency.is_quote_default,
        base_currency_code: base,
        official_rate: official?.rate ?? null,
        official_rate_id: official?.exchange_rate_id ?? null,
        official_provider_key: official?.provider_key ?? null,
        official_provider_name:
          context.providers.find((p) => p.key === official?.provider_key)
            ?.name ?? null,
        official_effective_date: official?.effective_date ?? null,
        official_valid_until: official?.valid_until ?? null,
        official_fetched_at: officialRow?.fetched_at ?? null,
        official_age_days: official
          ? daysBetween(official.effective_date, today())
          : null,
        official_is_stale: official?.is_stale ?? null,
        commercial_rate: hasCommercial ? commercial.rate : null,
        commercial_rate_id: hasCommercial ? commercial.exchange_rate_id : null,
        commercial_effective_date: hasCommercial
          ? commercial.effective_date
          : null,
        commercial_valid_until: hasCommercial ? commercial.valid_until : null,
        commercial_diff_percent:
          hasCommercial && official
            ? Math.round((commercial.rate / official.rate - 1) * 1e6) / 1e4
            : null,
      };
    });
};

/**
 * `exchange_rates_before_insert`: the base is forced and a person's rate is
 * signed by the session. Demo mode only ever holds manual rates.
 */
export const exchangeRateCallbacks = (
  getSalesId: () => Promise<Identifier | null>,
): ResourceCallbacks<ExchangeRate> => ({
  resource: "exchange_rates",
  beforeCreate: async (params, dataProvider) => {
    const context = await loadContext(dataProvider);
    const now = new Date().toISOString();
    return {
      ...params,
      data: {
        ...params.data,
        base_currency_code: baseOf(context),
        provider_id: null,
        created_by: await getSalesId(),
        fetched_at: now,
        created_at: now,
      },
    };
  },
});

/**
 * The admin side, demo-side: nothing here can reach a provider, Vault or the
 * scheduler, and saying so is the honest answer.
 */
export const createDemoFxMethods = (
  getDataProvider: () => DataProvider,
): FxMethods => ({
  getFxIntegrationHealth: async () => {
    throw new Error(FX_DEMO_UNAVAILABLE);
  },
  syncExchangeRatesNow: async () => {
    throw new Error(FX_DEMO_UNAVAILABLE);
  },
  setFxProviderSecret: async () => {
    throw new Error(FX_DEMO_UNAVAILABLE);
  },
  setBaseCurrency: async (code) => {
    const dataProvider = getDataProvider();
    const context = await loadContext(dataProvider);
    const base = baseOf(context);
    if (code === base) return;
    const quotes = await listAll<Quote>(dataProvider, "quotes");
    if (
      context.rates.length > 0 ||
      quotes.some((quote) => quote.currency !== base)
    ) {
      throw new Error("crm.fx.errors.fx_base_locked");
    }
    for (const currency of context.currencies) {
      if (currency.is_base !== (currency.code === code)) {
        await dataProvider.update("currencies", {
          id: currency.id,
          data: { is_base: currency.code === code },
          previousData: currency,
        });
      }
    }
  },
});
