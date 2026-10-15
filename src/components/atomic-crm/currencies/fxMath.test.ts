import { describe, expect, it } from "vitest";

import {
  convertPrice,
  deviationPercent,
  rateIsStale,
  toBase,
  toScaled,
} from "./fxMath";

/**
 * Every expected value below is one `supabase/tests/database/fx_quotes.test.sql`
 * asserts on the stored columns. If the SQL changes, these change with it --
 * never the other way round.
 */
describe("convertPrice (parity with quote_lines_fx_convert)", () => {
  it.each([
    // [source, sourceRate, targetRate, targetDecimals, expected, case]
    [4000000, 1, 4000, 2, 1000, "COP to USD: 4,000,000 COP at 4,000"],
    [2000000, 1, 4000, 2, 500, "COP to USD: 2,000,000 COP at 4,000"],
    [1000, 4000, 1, 0, 4000000, "USD to COP, in whole pesos"],
    [100, 5000, 4000, 2, 125, "EUR to USD through the base"],
    [4000000, 1, 4500, 2, 888.89, "COP to USD at 4,500"],
    [100, 5000, 4500, 2, 111.11, "EUR to USD at 4,500"],
    [0.01, 1, 2, 2, 0.01, "a half cent rounds away from zero"],
    [0.03, 1, 2, 2, 0.02, "1.5 cents rounds to 2"],
  ] as const)(
    "%s at %s/%s -> %s (%s)",
    (source, sourceRate, targetRate, decimals, expected, _case) => {
      expect(convertPrice(source, sourceRate, targetRate, decimals)).toBe(
        expected,
      );
    },
  );

  it("converts the brief's example: a 4,000,000 COP product quoted in USD at 4,000", () => {
    // Arrange
    const basePrice = 4000000;
    const trm = 4000;

    // Act
    const usd = convertPrice(basePrice, 1, trm, 2);

    // Assert
    expect(usd).toBe(1000);
    expect(toBase(usd, trm, 0)).toBe(4000000);
  });

  it("rounds to the target currency's decimals, capped at the two stored", () => {
    expect(convertPrice(1, 3333.3333333333, 1, 0)).toBe(3333);
    expect(convertPrice(1, 3333.3333333333, 1, 4)).toBe(3333.33);
  });

  it("returns 0 rather than Infinity when a rate is missing", () => {
    expect(convertPrice(100, 1, 0)).toBe(0);
  });

  it("keeps ten-decimal rates exact where a float product would drift", () => {
    // 1234.56 at 3312.8412345678 is 4,089,901.2737... (checked with
    // Python's decimal module).
    expect(convertPrice(1234.56, 3312.8412345678, 1, 2)).toBe(4089901.27);
  });
});

describe("toBase (parity with refresh_quote_version_totals)", () => {
  it.each([
    [2625.5, 4000, 0, 10502000],
    [150, 4000, 0, 600000],
    [256.5, 4000, 0, 1026000],
    [2732, 4000, 0, 10928000],
  ] as const)("%s at %s -> %s", (amount, rate, decimals, expected) => {
    expect(toBase(amount, rate, decimals)).toBe(expected);
  });

  it("rounds the equivalent once, on the total", () => {
    // 0.01 USD at 3312.84 is 33.1284 COP: 33 whole pesos, 33.13 with cents.
    expect(toBase(0.01, 3312.84, 0)).toBe(33);
    expect(toBase(0.01, 3312.84, 2)).toBe(33.13);
  });
});

describe("toScaled", () => {
  it("reads a numeric string exactly and rounds an extra digit half away from zero", () => {
    expect(toScaled("4000.0000000000", 10)).toBe(40000000000000n);
    expect(toScaled("1.005", 2)).toBe(101n);
    expect(toScaled("", 2)).toBe(0n);
  });
});

describe("deviationPercent", () => {
  it("measures how far a custom rate is from the official one", () => {
    expect(deviationPercent(4100, 4000)).toBeCloseTo(2.5, 10);
    expect(deviationPercent(4100, 0)).toBeNull();
  });
});

/**
 * The same eight cases `fx_quote_source_rates.test.sql` asserts on
 * `fx_rate_is_stale()`, on a fixed day: the screens and the issue gate apply
 * one rule.
 */
describe("rateIsStale (parity with fx_rate_is_stale)", () => {
  const on = "2026-10-02";
  it.each([
    // [kind, effectiveDate, validUntil, expected, case]
    [
      "official",
      "2026-10-01",
      "2026-10-01",
      true,
      "past its stated validity, one day old",
    ],
    [
      "official",
      "2026-09-30",
      "2026-10-02",
      false,
      "a weekend TRM still in force",
    ],
    ["official", "2026-09-29", null, false, "no validity, three days old"],
    ["official", "2026-09-28", null, true, "no validity, four days old"],
    [
      "commercial",
      "2026-09-27",
      "2026-10-01",
      true,
      "a commercial rate past its expiry",
    ],
    [
      "commercial",
      "2026-08-13",
      null,
      false,
      "a commercial rate with no expiry",
    ],
    ["custom", "2026-08-13", null, false, "a custom rate never"],
    ["base", "2026-08-13", null, false, "the base never"],
  ] as const)(
    "%s %s / %s -> %s (%s)",
    (kind, effectiveDate, validUntil, expected, _case) => {
      expect(
        rateIsStale({ kind, effectiveDate, validUntil, on, staleAfterDays: 3 }),
      ).toBe(expected);
    },
  );

  it("makes Thursday's ECB fixing stale on Easter Monday: four calendar days", () => {
    expect(
      rateIsStale({
        kind: "official",
        effectiveDate: "2026-04-02",
        validUntil: null,
        on: "2026-04-06",
        staleAfterDays: 3,
      }),
    ).toBe(true);
  });
});
