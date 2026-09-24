import { useTranslate } from "ra-core";

import { formatMoneyExact } from "../misc/reporting";
import type { QuoteAmounts } from "./quoteMath";

/**
 * What the document adds up to.
 *
 * The figures come from `quoteMath`, which reproduces the generated columns
 * digit for digit, so the block updates as a quantity is typed instead of after
 * the save. THE SERVER STILL OWNS THE NUMBERS (D8): what lands in
 * `quote_versions` is recomputed by a trigger and read back, and nothing here is
 * ever written.
 *
 * The effective discount is shown only when there is one. It is the figure the
 * approval gate reads (§3.1), and a rep who cannot see it before issuing learns
 * the ceiling by being refused.
 */
export const QuoteTotals = ({
  amounts,
  currency,
  effectiveDiscount,
}: {
  amounts: QuoteAmounts;
  currency: string;
  effectiveDiscount?: number | null;
}) => {
  const translate = useTranslate();

  const rows: { key: string; label: string; value: string }[] = [
    {
      key: "subtotal",
      label: translate("resources.quotes.totals.subtotal"),
      value: formatMoneyExact(amounts.subtotal, currency),
    },
  ];

  if (amounts.discount_total > 0) {
    rows.push({
      key: "discount",
      label:
        effectiveDiscount == null
          ? translate("resources.quotes.totals.discount")
          : translate("resources.quotes.totals.discount_with_percent", {
              percent: effectiveDiscount.toFixed(2),
            }),
      value: `- ${formatMoneyExact(amounts.discount_total, currency)}`,
    });
  }

  rows.push({
    key: "tax",
    label: translate("resources.quotes.totals.tax"),
    value: formatMoneyExact(amounts.tax_total, currency),
  });

  return (
    <dl className="ml-auto w-full max-w-xs text-sm">
      {rows.map((row) => (
        <div key={row.key} className="flex justify-between py-0.5">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="tabular-nums">{row.value}</dd>
        </div>
      ))}
      {/* `quote-total` is a styling hook: the customer portal sets the figure
          apart without a second copy of this block. */}
      <div className="quote-total mt-1 flex justify-between border-t pt-1 font-medium">
        <dt>{translate("resources.quotes.totals.total")}</dt>
        <dd className="tabular-nums">
          {formatMoneyExact(amounts.total, currency)}
        </dd>
      </div>
    </dl>
  );
};
