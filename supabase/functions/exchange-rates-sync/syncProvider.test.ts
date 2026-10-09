import { describe, expect, it } from "vitest";

import { createFetchJson } from "./fetchWithRetry.ts";
import type { FetchLike, RateProvider } from "./providers/types.ts";
import { syncProvider, type Rpc } from "./syncProvider.ts";
import { parseSyncRequest } from "./syncRequest.ts";

const noSleep = async () => {};

const respond =
  (
    ...responses: Array<{ status: number; body?: unknown } | "hang" | Error>
  ): FetchLike =>
  (_url, init) => {
    const next = responses.shift();
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    if (next === "hang" || next === undefined) {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      });
    }
    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    });
  };

describe("fetchJson with retry", () => {
  it("retries a 503 and returns the next good answer, counting both attempts", async () => {
    // Arrange
    const { fetchJson, attemptsUsed } = createFetchJson({
      fetchImpl: respond({ status: 503 }, { status: 200, body: { ok: 1 } }),
      timeoutMs: 1000,
      maxAttempts: 3,
      sleep: noSleep,
    });

    // Act
    const body = await fetchJson("https://api.test/rates");

    // Assert
    expect(body).toEqual({ ok: 1 });
    expect(attemptsUsed()).toBe(2);
  });

  it("gives up after the attempt budget on a timeout, saying so", async () => {
    const { fetchJson, attemptsUsed } = createFetchJson({
      fetchImpl: respond("hang", "hang"),
      timeoutMs: 5,
      maxAttempts: 2,
      sleep: noSleep,
    });

    await expect(fetchJson("https://api.test/rates")).rejects.toThrow(
      "timeout after 5 ms (api.test)",
    );
    expect(attemptsUsed()).toBe(2);
  });

  it("does not retry a 404, which another try will not fix", async () => {
    const { fetchJson, attemptsUsed } = createFetchJson({
      fetchImpl: respond({ status: 404 }, { status: 200, body: {} }),
      timeoutMs: 1000,
      maxAttempts: 3,
      sleep: noSleep,
    });

    await expect(fetchJson("https://api.test/rates")).rejects.toThrow(
      "HTTP 404",
    );
    expect(attemptsUsed()).toBe(1);
  });
});

/** A fake of the four SQL functions, recording what was called. */
const fakeDatabase = (
  claim: Record<string, unknown>,
  rejectedPerItem = false,
) => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push([fn, args]);
    if (fn === "fx_begin_sync_run") return { data: claim, error: null };
    if (fn === "fx_record_rates") {
      const items = args.p_items as unknown[];
      return {
        data: {
          received: items.length,
          inserted: rejectedPerItem ? 0 : items.length,
          rejected: rejectedPerItem
            ? items.map(() => ({ reason: "rate_not_positive" }))
            : [],
        },
        error: null,
      };
    }
    return { data: { status: "ok" }, error: null };
  };
  return { rpc, calls };
};

const provider = (
  result: () => Promise<unknown[]>,
): Record<string, RateProvider> => ({
  trm_co: {
    key: "trm_co",
    fetchRates: async (_request, fetchJson) => {
      await fetchJson("https://api.test/trm");
      return (await result()) as never;
    },
  },
});

const baseOptions = {
  providerKey: "trm_co",
  triggeredBy: "cron" as const,
  force: false,
  salesId: null,
  timeoutMs: 1000,
  maxAttempts: 3,
  sleep: noSleep,
};

describe("syncProvider", () => {
  it("does nothing when the database says the provider is not due", async () => {
    // Arrange
    const db = fakeDatabase({ skipped: "not_due" });

    // Act
    const outcome = await syncProvider({
      ...baseOptions,
      rpc: db.rpc,
      registry: provider(async () => []),
      fetchImpl: respond(),
    });

    // Assert
    expect(outcome).toEqual({
      provider: "trm_co",
      status: "skipped",
      reason: "not_due",
    });
    expect(db.calls.map(([fn]) => fn)).toEqual(["fx_begin_sync_run"]);
  });

  it("stores what the provider returned and closes the run as succeeded", async () => {
    const db = fakeDatabase({ run_id: 7, currencies: ["USD"], base: "COP" });

    const outcome = await syncProvider({
      ...baseOptions,
      rpc: db.rpc,
      registry: provider(async () => [
        {
          currency: "USD",
          quote_currency: "COP",
          rate: "3312.84",
          effective_date: "2026-10-01",
        },
      ]),
      fetchImpl: respond({ status: 200, body: [] }),
    });

    expect(outcome).toMatchObject({
      status: "succeeded",
      runId: 7,
      inserted: 1,
      attempts: 1,
    });
    expect(db.calls.at(-1)).toEqual([
      "fx_finish_sync_run",
      { p_run_id: 7, p_ok: true, p_attempts: 1, p_error: null },
    ]);
  });

  it("closes the run as failed with the reason when the API stays down, storing nothing", async () => {
    const db = fakeDatabase({ run_id: 8, currencies: ["USD"], base: "COP" });

    const outcome = await syncProvider({
      ...baseOptions,
      rpc: db.rpc,
      registry: provider(async () => []),
      fetchImpl: respond({ status: 503 }, { status: 503 }, { status: 503 }),
    });

    expect(outcome).toMatchObject({
      status: "failed",
      attempts: 3,
      error: "HTTP 503 from api.test",
    });
    expect(db.calls.map(([fn]) => fn)).toEqual([
      "fx_begin_sync_run",
      "fx_finish_sync_run",
    ]);
  });

  it("treats a response in which every rate was refused as a failure, not a quiet success", async () => {
    const db = fakeDatabase(
      { run_id: 9, currencies: ["USD"], base: "COP" },
      true,
    );

    const outcome = await syncProvider({
      ...baseOptions,
      rpc: db.rpc,
      registry: provider(async () => [
        {
          currency: "USD",
          quote_currency: "COP",
          rate: "-1",
          effective_date: "2026-10-01",
        },
      ]),
      fetchImpl: respond({ status: 200, body: [] }),
    });

    expect(outcome).toMatchObject({
      status: "failed",
      error: "the provider returned no valid rate",
    });
  });

  it("fails the run of a provider row with no implementation", async () => {
    const db = fakeDatabase({ run_id: 10, currencies: [], base: "COP" });

    const outcome = await syncProvider({
      ...baseOptions,
      providerKey: "unknown_bank",
      rpc: db.rpc,
      registry: {},
      fetchImpl: respond(),
    });

    expect(outcome).toMatchObject({
      status: "failed",
      error: "no implementation for provider 'unknown_bank'",
    });
  });
});

describe("parseSyncRequest", () => {
  it("accepts an empty body as 'every due provider'", () => {
    expect(parseSyncRequest(null)).toEqual({ ok: true, value: {} });
  });

  it("refuses a provider key that is not one", () => {
    expect(parseSyncRequest({ provider: "trm; drop" })).toMatchObject({
      ok: false,
    });
  });

  it("refuses a backfill with one bound, an inverted range or more than a year", () => {
    expect(parseSyncRequest({ from: "2026-01-01" })).toMatchObject({
      ok: false,
    });
    expect(
      parseSyncRequest({ from: "2026-02-01", to: "2026-01-01" }),
    ).toMatchObject({ ok: false });
    expect(
      parseSyncRequest({ from: "2024-01-01", to: "2026-01-01" }),
    ).toMatchObject({ ok: false });
  });

  it("accepts a valid backfill range", () => {
    expect(
      parseSyncRequest({
        provider: "trm_co",
        from: "2026-01-01",
        to: "2026-03-31",
      }),
    ).toEqual({
      ok: true,
      value: { provider: "trm_co", from: "2026-01-01", to: "2026-03-31" },
    });
  });
});
