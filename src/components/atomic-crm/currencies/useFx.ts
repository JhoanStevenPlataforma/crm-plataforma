import { useGetList, useGetOne } from "ra-core";

import type {
  Currency,
  CurrentExchangeRate,
  ExchangeRateProvider,
  ExchangeRateSettings,
} from "../types";

const ALL = { page: 1, perPage: 200 };

/**
 * The currency catalogue. Small and read on every quotation screen, so it is
 * cached for five minutes rather than refetched per mount.
 */
export const useCurrencies = () => {
  const {
    data = [],
    isPending,
    refetch,
  } = useGetList<Currency>(
    "currencies",
    { pagination: ALL, sort: { field: "code", order: "ASC" } },
    { staleTime: 5 * 60_000 },
  );
  const base = data.find((currency) => currency.is_base) ?? null;
  return {
    currencies: data,
    active: data.filter((currency) => currency.is_active),
    base,
    decimalsOf: (code: string | null | undefined) =>
      data.find((currency) => currency.code === code)?.decimals ?? 2,
    isPending,
    refetch,
  };
};

/** `current_exchange_rates`: the one place a "current rate" is read from. */
export const useCurrentRates = () => {
  const {
    data = [],
    isPending,
    refetch,
  } = useGetList<CurrentExchangeRate>("current_exchange_rates", {
    pagination: ALL,
    sort: { field: "currency_code", order: "ASC" },
  });
  return { rates: data, isPending, refetch };
};

export const useRateProviders = () => {
  const {
    data = [],
    isPending,
    refetch,
  } = useGetList<ExchangeRateProvider>("exchange_rate_providers", {
    pagination: ALL,
    sort: { field: "priority", order: "ASC" },
  });
  return { providers: data, isPending, refetch };
};

export const useFxSettings = () => {
  const { data, isPending, refetch } = useGetOne<ExchangeRateSettings>(
    "exchange_rate_settings",
    { id: 1 },
  );
  return { settings: data ?? null, isPending, refetch };
};
