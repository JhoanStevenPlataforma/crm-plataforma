import { describe, expect, it } from "vitest";

import {
  buildFrankfurterUrl,
  createFrankfurterProvider,
  parseFrankfurter,
} from "./providers/ecbFrankfurter.ts";
import {
  buildTrmUrl,
  createTrmProvider,
  parseTrmRows,
} from "./providers/trmCo.ts";

// Responses recorded from the live APIs on 2026-10-01.
const TRM_RESPONSE = [
  {
    valor: "3312.84",
    unidad: "COP",
    vigenciadesde: "2026-10-01T00:00:00.000",
    vigenciahasta: "2026-10-01T00:00:00.000",
  },
  {
    valor: "3341.23",
    unidad: "COP",
    vigenciadesde: "2026-09-26T00:00:00.000",
    vigenciahasta: "2026-09-28T00:00:00.000",
  },
];
const FRANKFURTER_LATEST = {
  amount: 1.0,
  base: "USD",
  date: "2026-10-01",
  rates: { EUR: 0.88511, MXN: 18.1669 },
};
const FRANKFURTER_RANGE = {
  amount: 1.0,
  base: "USD",
  start_date: "2026-09-24",
  end_date: "2026-09-25",
  rates: { "2026-09-24": { EUR: 0.87974 }, "2026-09-25": { EUR: 0.87696 } },
};

describe("TRM provider", () => {
  it("reads each row as 1 USD in COP, with the weekend's validity", () => {
    // Act
    const items = parseTrmRows(TRM_RESPONSE);

    // Assert
    expect(items.map(({ raw: _raw, ...item }) => item)).toEqual([
      {
        currency: "USD",
        quote_currency: "COP",
        rate: "3312.84",
        effective_date: "2026-10-01",
        valid_until: "2026-10-01",
      },
      {
        currency: "USD",
        quote_currency: "COP",
        rate: "3341.23",
        effective_date: "2026-09-26",
        valid_until: "2026-09-28",
      },
    ]);
  });

  it("passes an unreadable value on as empty, so the database records the refusal", () => {
    const [item] = parseTrmRows([
      { valor: "n/a", vigenciadesde: "2026-10-01T00:00:00.000" },
    ]);

    expect(item.rate).toBe("");
  });

  it("refuses a response that is not a list of rows", () => {
    expect(() => parseTrmRows({ error: "rate limited" })).toThrow(/not a list/);
  });

  it("asks for a date range on a backfill and for the latest rows otherwise", () => {
    const latest = new URL(buildTrmUrl("https://x.test/trm.json", {}));
    const range = new URL(
      buildTrmUrl("https://x.test/trm.json", {
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    );

    expect(latest.searchParams.get("$limit")).toBe("5");
    expect(latest.searchParams.get("$where")).toBeNull();
    expect(range.searchParams.get("$where")).toBe(
      "vigenciadesde between '2026-01-01T00:00:00' and '2026-01-31T00:00:00'",
    );
  });

  it("does not call the API when USD is not among the requested currencies", async () => {
    // Arrange
    const calls: string[] = [];
    const provider = createTrmProvider("https://x.test/trm.json");

    // Act
    const items = await provider.fetchRates(
      { currencies: ["EUR"], base: "COP" },
      async (url) => {
        calls.push(url);
        return TRM_RESPONSE;
      },
    );

    // Assert
    expect(items).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("ECB (Frankfurter) provider", () => {
  it("reads the latest rates as 1 USD in each currency, as printed", () => {
    const items = parseFrankfurter(FRANKFURTER_LATEST);

    expect(
      items.map((i) => [
        i.currency,
        i.quote_currency,
        i.rate,
        i.effective_date,
      ]),
    ).toEqual([
      ["USD", "EUR", "0.88511", "2026-10-01"],
      ["USD", "MXN", "18.1669", "2026-10-01"],
    ]);
  });

  it("reads a historical range day by day", () => {
    const items = parseFrankfurter(FRANKFURTER_RANGE);

    expect(items.map((i) => [i.effective_date, i.rate])).toEqual([
      ["2026-09-24", "0.87974"],
      ["2026-09-25", "0.87696"],
    ]);
  });

  it("refuses a payload with no rates", () => {
    expect(() => parseFrankfurter({ message: "not found" })).toThrow(
      /no rates/,
    );
  });

  it("never asks the ECB for the pivot itself", async () => {
    // Arrange
    let requested = "";
    const provider = createFrankfurterProvider("https://fx.test/v1");

    // Act
    await provider.fetchRates(
      { currencies: ["USD", "EUR", "MXN"], base: "COP" },
      async (url) => {
        requested = url;
        return FRANKFURTER_LATEST;
      },
    );

    // Assert
    expect(requested).toBe(
      buildFrankfurterUrl("https://fx.test/v1", ["EUR", "MXN"], {}),
    );
    expect(new URL(requested).searchParams.get("to")).toBe("EUR,MXN");
  });
});
