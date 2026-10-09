/**
 * The currency module's RPCs and its one edge function, as data-provider
 * methods (docs/proposals/multi-currency-fx.md). The demo mirror implements
 * the same `FxMethods` contract (`fakerest/fxMethods.ts`).
 *
 * Refusals become an `FxRpcError` carrying the key from the exception's
 * DETAIL, never the message (`providers/commons/fxRpc.ts`).
 */

import type { FxIntegrationHealth, FxSyncOutcome } from "../../types";
import { fxRpcError } from "../commons/fxRpc";

export type FxSyncRequest = {
  /** One provider's key; all enabled providers when absent. */
  provider?: string | null;
  /** A historical backfill, both bounds inclusive (YYYY-MM-DD). */
  from?: string | null;
  to?: string | null;
};

export type FxMethods = {
  /** `fx_integration_health()`: the health panel's single read. */
  getFxIntegrationHealth(): Promise<FxIntegrationHealth>;
  /** "Sync now" (admins): calls the providers, bypassing the cache. */
  syncExchangeRatesNow(request?: FxSyncRequest): Promise<FxSyncOutcome[]>;
  /** Stores a provider's credentials in Vault; an empty value clears them. */
  setFxProviderSecret(providerKey: string, secret: string): Promise<void>;
  /** Switches the base currency, while nothing depends on it yet. */
  setBaseCurrency(code: string): Promise<void>;
};

/** The parts of the Supabase client these methods use. */
export type FxClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message?: string | null; details?: string | null } | null;
  }>;
  functions: {
    invoke: <T>(
      name: string,
      options: { method?: "POST"; body?: Record<string, unknown> },
    ) => Promise<{
      data: T | null;
      error: {
        message?: string;
        context?: { json?: () => Promise<unknown> };
      } | null;
    }>;
  };
};

export const createFxMethods = (getClient: () => FxClient): FxMethods => {
  const call = async <T>(
    fn: string,
    args: Record<string, unknown>,
    fallbackMessage: string,
  ): Promise<T> => {
    const { data, error } = await getClient().rpc(fn, args);
    if (error) {
      throw fxRpcError(error, fallbackMessage);
    }
    return data as T;
  };

  return {
    getFxIntegrationHealth: () =>
      call<FxIntegrationHealth>(
        "fx_integration_health",
        {},
        "Failed to read the integration health",
      ),

    syncExchangeRatesNow: async (request = {}) => {
      const body: Record<string, unknown> = {};
      if (request.provider) body.provider = request.provider;
      if (request.from && request.to) {
        body.from = request.from;
        body.to = request.to;
      }
      const { data, error } = await getClient().functions.invoke<{
        data: FxSyncOutcome[];
      }>("exchange-rates-sync", { method: "POST", body });

      if (error || !data) {
        const payload = (await error?.context?.json?.().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          payload?.message ?? error?.message ?? "Failed to update the rates",
        );
      }
      return data.data;
    },

    setFxProviderSecret: (providerKey, secret) =>
      call<void>(
        "set_fx_provider_secret",
        { p_provider_key: providerKey, p_secret: secret },
        "Failed to store the credentials",
      ),

    setBaseCurrency: (code) =>
      call<void>(
        "set_base_currency",
        { p_code: code },
        "Failed to change the base currency",
      ),
  };
};
