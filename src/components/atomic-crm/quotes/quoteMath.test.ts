import {
  effectiveDiscountPercent,
  lineAmounts,
  quoteAmounts,
} from "./quoteMath";
import { PARITY_CASES } from "./quoteFixtures";

/**
 * These assertions are about AGREEMENT WITH POSTGRES, not about the code below
 * them. The expected numbers in `PARITY_CASES` were read out of the database in
 * `supabase/tests/database/quotes_schema.test.sql`, where the same lines were
 * inserted and the generated columns asserted; a change here that stops the
 * preview matching the document turns them red.
 */
describe("quoteMath", () => {
  describe("lineAmounts", () => {
    it.each(PARITY_CASES)(
      "matches what the database stores for $what",
      ({ line, expected }) => {
        const [gross, discount, tax, total] = expected;

        expect(lineAmounts(line)).toEqual({
          line_gross: gross,
          line_discount: discount,
          line_tax: tax,
          line_total: total,
        });
      },
    );

    it("rounds a half away from zero, as round(numeric, 2) does", () => {
      // `1.005 * 100` is 100.49999999999999 as a binary double, so anything
      // rounding the decimals directly answers 1.00 where the database stores
      // 1.01 (quotes_schema.test.sql, position 15).
      expect(
        lineAmounts({
          quantity: 1.005,
          unit_price: 1,
          discount_percent: 0,
          tax_rate_percent: 0,
        }).line_gross,
      ).toBe(1.01);
    });

    it("applies the discount before the tax, so tax follows what is charged", () => {
      // 1000 gross, 10% off leaves 900, 19% of 900 is 171.
      expect(
        lineAmounts({
          quantity: 1,
          unit_price: 1000,
          discount_percent: 10,
          tax_rate_percent: 19,
        }),
      ).toEqual({
        line_gross: 1000,
        line_discount: 100,
        line_tax: 171,
        line_total: 1071,
      });
    });

    it("reads a missing quantity or price as zero instead of NaN", () => {
      expect(
        lineAmounts({
          quantity: Number.NaN,
          unit_price: 1000,
          discount_percent: 0,
          tax_rate_percent: 19,
        }),
      ).toEqual({
        line_gross: 0,
        line_discount: 0,
        line_tax: 0,
        line_total: 0,
      });
    });
  });

  describe("quoteAmounts", () => {
    it("rounds each line and then sums, never the other way round", () => {
      // Three lines of 0.03 at 19%: 0.0057 each shows as 0.01, so the document
      // charges 0.03 of tax. Summed first it would be 0.0171 -> 0.02, and the
      // totals row would contradict the three lines above it. The database
      // stores 0.03 (quotes_schema.test.sql).
      const lines = Array.from({ length: 3 }, () => ({
        quantity: 1,
        unit_price: 0.03,
        discount_percent: 0,
        tax_rate_percent: 19,
      }));

      expect(quoteAmounts(lines)).toEqual({
        subtotal: 0.09,
        discount_total: 0,
        tax_total: 0.03,
        total: 0.12,
      });
    });

    it("reproduces the version totals the database computed", () => {
      // The two lines of quotes_schema.test.sql, whose version row holds
      // [3500.00, 300.00, 608.00, 3808.00].
      expect(
        quoteAmounts([
          {
            quantity: 3,
            unit_price: 1000,
            discount_percent: 10,
            tax_rate_percent: 19,
          },
          {
            quantity: 1.5,
            unit_price: 333.33,
            discount_percent: 0,
            tax_rate_percent: 19,
          },
        ]),
      ).toEqual({
        subtotal: 3500,
        discount_total: 300,
        tax_total: 608,
        total: 3808,
      });
    });

    it("adds in cents, so a sum of tenths is not 0.30000000000000004", () => {
      const lines = [0.1, 0.2].map((unit_price) => ({
        quantity: 1,
        unit_price,
        discount_percent: 0,
        tax_rate_percent: 0,
      }));

      expect(quoteAmounts(lines).total).toBe(0.3);
    });

    it("is all zeros for a document with no lines", () => {
      expect(quoteAmounts([])).toEqual({
        subtotal: 0,
        discount_total: 0,
        tax_total: 0,
        total: 0,
      });
    });
  });

  describe("effectiveDiscountPercent", () => {
    it("weighs the discount by the money, not by the number of lines", () => {
      // 50% off ten pesos beside an undiscounted million is not a 25% discount,
      // and `quote_discount_gate()` does not think it is either.
      const percent = effectiveDiscountPercent([
        {
          quantity: 1,
          unit_price: 10,
          discount_percent: 50,
          tax_rate_percent: 0,
        },
        {
          quantity: 1,
          unit_price: 1_000_000,
          discount_percent: 0,
          tax_rate_percent: 0,
        },
      ]);

      expect(percent).toBeCloseTo(0.0005, 6);
    });

    it("is null when there is nothing to discount, never a clean 0%", () => {
      expect(effectiveDiscountPercent([])).toBeNull();
    });
  });
});
