import { createFetchJson, FxFetchError } from "./fetchWithRetry.ts";
import type { FetchLike, RateProvider } from "./providers/types.ts";

/** The subset of a Supabase client's `rpc` this module calls. */
export type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type SyncOptions = {
  providerKey: string;
  triggeredBy: "cron" | "manual" | "backfill";
  force: boolean;
  salesId: number | null;
  from?: string;
  to?: string;
  rpc: Rpc;
  registry: Record<string, RateProvider>;
  fetchImpl: FetchLike;
  timeoutMs: number;
  maxAttempts: number;
  sleep?: (ms: number) => Promise<void>;
  readSecret?: (providerKey: string) => Promise<string | null>;
};

export type SyncOutcome =
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

const call = async (rpc: Rpc, fn: string, args: Record<string, unknown>) => {
  const { data, error } = await rpc(fn, args);
  if (error) {
    throw new Error(`${fn}: ${error.message}`);
  }
  return data as Record<string, unknown>;
};

/**
 * One provider, one run: claim it (the database decides whether it is due and
 * refuses a concurrent run), fetch with timeout and retry, validate, store,
 * close. Whatever happens after the claim, the run is closed -- a run left
 * `running` would hold the provider's lock until the reaper frees it.
 */
export const syncProvider = async (
  options: SyncOptions,
): Promise<SyncOutcome> => {
  const claim = await call(options.rpc, "fx_begin_sync_run", {
    p_provider_key: options.providerKey,
    p_triggered_by: options.triggeredBy,
    p_force: options.force,
    p_sales_id: options.salesId,
  });

  if (typeof claim.skipped === "string") {
    return {
      provider: options.providerKey,
      status: "skipped",
      reason: claim.skipped,
    };
  }

  const runId = Number(claim.run_id);
  const currencies = (claim.currencies as string[] | null) ?? [];
  const { fetchJson, attemptsUsed } = createFetchJson({
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    maxAttempts: options.maxAttempts,
    sleep: options.sleep,
  });

  const fail = async (message: string) => {
    await call(options.rpc, "fx_finish_sync_run", {
      p_run_id: runId,
      p_ok: false,
      p_attempts: attemptsUsed(),
      p_error: message,
    });
    return {
      provider: options.providerKey,
      status: "failed" as const,
      runId,
      attempts: attemptsUsed(),
      error: message,
    };
  };

  try {
    const provider = options.registry[options.providerKey];
    if (!provider) {
      return await fail(
        `no implementation for provider '${options.providerKey}'`,
      );
    }

    const credentials = options.readSecret
      ? await options.readSecret(options.providerKey)
      : null;
    const items = await provider.fetchRates(
      {
        currencies,
        base: String(claim.base ?? ""),
        from: options.from,
        to: options.to,
        credentials,
      },
      fetchJson,
    );

    // Everything goes to the database, which validates each item and
    // records every refusal on the run with its reason.
    const recorded = await call(options.rpc, "fx_record_rates", {
      p_run_id: runId,
      p_items: items,
    });
    const rejected = Array.isArray(recorded.rejected)
      ? recorded.rejected.length
      : 0;

    // A response in which EVERY item was refused is a failure, not a success
    // with zero rows: otherwise a provider that silently changed its format
    // would look healthy forever. (A replay -- nothing new, nothing refused --
    // is a success.)
    if (items.length > 0 && rejected === items.length) {
      return await fail("the provider returned no valid rate");
    }

    await call(options.rpc, "fx_finish_sync_run", {
      p_run_id: runId,
      p_ok: true,
      p_attempts: attemptsUsed(),
      p_error: null,
    });
    return {
      provider: options.providerKey,
      status: "succeeded",
      runId,
      attempts: attemptsUsed(),
      received: items.length,
      inserted: Number(recorded.inserted ?? 0),
      rejected,
    };
  } catch (error: unknown) {
    const message =
      error instanceof FxFetchError || error instanceof Error
        ? error.message
        : String(error);
    return await fail(message);
  }
};
