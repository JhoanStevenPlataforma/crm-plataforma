/**
 * The line arithmetic of a quotation, in the browser.
 *
 * THE SERVER OWNS THE TOTALS (quotes D8). `quote_lines.line_gross`,
 * `line_discount`, `line_tax` and `line_total` are `generated always as … stored`
 * columns and the version totals are rolled up by a trigger; nothing here is
 * ever written back. This module exists so the editor can show what the save
 * WILL produce, and its only requirement is to agree with Postgres digit for
 * digit — a preview that disagrees with the document is worse than no preview,
 * because the disagreement surfaces after the customer has the PDF.
 *
 * Two rules it copies from the database, both of them load-bearing:
 *
 *   * ROUND PER LINE, THEN SUM (`01_tables.sql`). Summing unrounded values and
 *     rounding once produces a total that contradicts its own visible line
 *     amounts by cents, which a customer notices and a salesperson cannot
 *     explain.
 *   * EACH COLUMN IS COMPUTED FROM BASE COLUMNS. A generated column may not
 *     reference another generated column, so the database repeats `round()`
 *     rather than chaining it; the order below is the same, which is what makes
 *     `line_total` the sum of the three amounts the document prints.
 *
 * The arithmetic runs on integers, not on the decimals themselves. A quantity
 * with three decimals against a two-decimal price lands on half a cent, and
 * `round(numeric, 2)` takes that half AWAY FROM ZERO: `1.005 × 1.00` is `1.01`
 * in the database. In binary floating point `1.005 * 100` is
 * `100.49999999999999`, so `Math.round` takes the same half DOWN and the
 * preview says `1.00`. Scaling both operands to integers first is what makes
 * the halfway cases exact rather than accidentally right.
 */

import type { QuoteLine } from "../types";

/** The scales the database stores: quantity 3 decimals, money and rates 2. */
const QUANTITY_SCALE = 1000;
const MONEY_SCALE = 100;
const PERCENT_SCALE = 100;

/**
 * `333.33` at scale 100 -> `33333`, exactly.
 *
 * Multiplying a decimal that genuinely has at most `scale` digits leaves an
 * error far below half a unit, so rounding recovers the exact integer. A value
 * with MORE decimals than the column holds is rounded here the way the database
 * would round it on insert.
 */
const toScaledInt = (value: number, scale: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * scale);

/**
 * Half away from zero, which is what `round(numeric, int)` does. Every amount
 * in this module is non-negative (the table's own check constraints), so half
 * away from zero and half up are the same rule here.
 */
const roundHalfUp = (value: number): number => Math.floor(value + 0.5);

/** Cents back to the number the rest of the app speaks in. */
const fromCents = (cents: number): number => cents / MONEY_SCALE;

/** The four amounts a line contributes, in cents. */
type LineAmountsInCents = {
  gross: number;
  discount: number;
  tax: number;
  total: number;
};

/**
 * The columns the arithmetic reads.
 *
 * Every one is optional, because a line being typed genuinely has blanks: a
 * cleared quantity box is `undefined` until the next keystroke, and a line the
 * server has not yet filled carries no `tax_rate_percent`. They read as zero
 * here, which is what the preview should show — never `NaN`.
 */
export type QuoteLineDraft = Partial<
  Record<
    keyof Pick<
      QuoteLine,
      "quantity" | "unit_price" | "discount_percent" | "tax_rate_percent"
    >,
    number | null
  >
>;

export type QuoteAmounts = {
  /** Before discount and tax: what `subtotal` on the version holds. */
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
};

const amountsInCents = (line: QuoteLineDraft): LineAmountsInCents => {
  const quantity = toScaledInt(line.quantity ?? 0, QUANTITY_SCALE);
  const unitPrice = toScaledInt(line.unit_price ?? 0, MONEY_SCALE);
  const discountPercent = toScaledInt(
    line.discount_percent ?? 0,
    PERCENT_SCALE,
  );
  const taxPercent = toScaledInt(line.tax_rate_percent ?? 0, PERCENT_SCALE);

  // quantity × unit_price is in thousandths of a cent; the division brings it
  // back to cents and the rounding is the one the stored column applies.
  const gross = roundHalfUp((quantity * unitPrice) / QUANTITY_SCALE);
  // A percentage at scale 100 against an amount in cents: 100 × 100.
  const discount = roundHalfUp(
    (gross * discountPercent) / (PERCENT_SCALE * PERCENT_SCALE),
  );
  const tax = roundHalfUp(
    ((gross - discount) * taxPercent) / (PERCENT_SCALE * PERCENT_SCALE),
  );

  return { gross, discount, tax, total: gross - discount + tax };
};

/**
 * One line's four amounts, the values `line_gross` … `line_total` will hold.
 *
 * Never sent back to the server: PostgreSQL refuses any value for a generated
 * column, including the unchanged one a form would post.
 */
export const lineAmounts = (line: QuoteLineDraft) => {
  const { gross, discount, tax, total } = amountsInCents(line);
  return {
    line_gross: fromCents(gross),
    line_discount: fromCents(discount),
    line_tax: fromCents(tax),
    line_total: fromCents(total),
  };
};

/**
 * What a document adds up to: each line rounded, then summed, exactly as
 * `refresh_quote_version_totals()` does it.
 *
 * Summing in cents rather than in the decimals keeps the addition exact too —
 * `0.1 + 0.2` is not `0.3` in binary floating point, and a totals row is where
 * that would show.
 */
export const quoteAmounts = (lines: QuoteLineDraft[]): QuoteAmounts => {
  const sum = (lines ?? []).reduce(
    (acc, line) => {
      const amounts = amountsInCents(line);
      return {
        gross: acc.gross + amounts.gross,
        discount: acc.discount + amounts.discount,
        tax: acc.tax + amounts.tax,
        total: acc.total + amounts.total,
      };
    },
    { gross: 0, discount: 0, tax: 0, total: 0 },
  );

  return {
    subtotal: fromCents(sum.gross),
    discount_total: fromCents(sum.discount),
    tax_total: fromCents(sum.tax),
    total: fromCents(sum.total),
  };
};

/**
 * The single percentage a document's discount amounts to, which is what the
 * approval gate reads (§3.1).
 *
 * Computed from the amounts rather than averaged over the lines: a 50% discount
 * on a line worth ten pesos and none on a line worth a million is not a 25%
 * discount, and `quote_discount_gate()` does not think it is either. Null when
 * there is nothing to discount, because "0% of nothing" reads as a document
 * that was checked and found clean.
 */
export const effectiveDiscountPercent = (
  lines: QuoteLineDraft[],
): number | null => {
  const { subtotal, discount_total } = quoteAmounts(lines);
  if (subtotal <= 0) return null;
  return (discount_total / subtotal) * 100;
};
