import type {
  Currency,
  ExchangeRateProvider,
  ExchangeRateSettings,
} from "../../../types";

/**
 * The currency catalogue, providers and settings exactly as
 * `20261001120000_currencies_fx.sql` seeds them. Keep the two identical.
 *
 * NO RATES are seeded. A rate is either fetched from a source or typed by a
 * person who answers for it; a demo inventing either would show a figure
 * nobody published. Demo mode cannot reach the providers (no edge function),
 * so its rates are the ones somebody types in on the Rates tab.
 */
export const DEMO_CURRENCIES: Currency[] = [
  {
    id: "COP",
    code: "COP",
    name: "Colombian peso",
    symbol: "$",
    decimals: 0,
    is_active: true,
    is_base: true,
    is_quote_default: true,
  },
  {
    id: "USD",
    code: "USD",
    name: "US dollar",
    symbol: "US$",
    decimals: 2,
    is_active: true,
    is_base: false,
    is_quote_default: false,
  },
  {
    id: "EUR",
    code: "EUR",
    name: "Euro",
    symbol: "€",
    decimals: 2,
    is_active: true,
    is_base: false,
    is_quote_default: false,
  },
  {
    id: "MXN",
    code: "MXN",
    name: "Mexican peso",
    symbol: "MX$",
    decimals: 2,
    is_active: true,
    is_base: false,
    is_quote_default: false,
  },
];

export const DEMO_EXCHANGE_RATE_PROVIDERS: ExchangeRateProvider[] = [
  {
    id: 1,
    key: "trm_co",
    name: "Superintendencia Financiera - TRM",
    description:
      "Official USD/COP market rate (TRM), published by the Superintendencia Financiera de Colombia through datos.gov.co.",
    is_enabled: true,
    priority: 10,
    requires_credentials: false,
    refresh_interval_minutes: 180,
    currencies: ["USD"],
    credentials_secret_id: null,
    last_attempt_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error: null,
    consecutive_failures: 0,
  },
  {
    id: 2,
    key: "ecb_frankfurter",
    name: "European Central Bank (Frankfurter)",
    description:
      "ECB reference rates through api.frankfurter.app, crossed into the base currency through the TRM of the same day.",
    is_enabled: true,
    priority: 20,
    requires_credentials: false,
    refresh_interval_minutes: 360,
    currencies: ["EUR", "MXN"],
    credentials_secret_id: null,
    last_attempt_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error: null,
    consecutive_failures: 0,
  },
];

export const DEMO_EXCHANGE_RATE_SETTINGS: ExchangeRateSettings[] = [
  {
    id: 1,
    quote_rate_kind_default: "commercial",
    stale_after_days: 3,
    rep_custom_rate_tolerance_percent: 0,
    failure_alert_threshold: 3,
  },
];
