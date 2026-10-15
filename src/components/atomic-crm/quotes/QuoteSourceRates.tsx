import { useGetMany, useLocaleState, useTranslate } from "ra-core";

import { Button } from "@/components/ui/button";

import { ToneBadge } from "../currencies/FxBadges";
import { rateIsStale } from "../currencies/fxMath";
import { formatDay, formatRate, serverToday } from "../currencies/fxFormat";
import type { ExchangeRate, QuoteLine, QuoteVersion } from "../types";

/**
 * The rates the version's LINES were converted at, one per source currency
 * (docs/proposals/multi-currency-fx.md §4): a COP quotation priced from a USD
 * list has rate 1 and USD lines, and those USD rates are what the issue gate
 * checks. Staleness is the one rule (`rateIsStale`, `fx_rate_is_stale()`).
 */
export const QuoteSourceRates = ({
  version,
  lines,
  base,
  staleAfterDays,
  isEditable,
  isPending,
  onRefresh,
}: {
  version: QuoteVersion;
  lines: QuoteLine[];
  base: string;
  staleAfterDays: number | null | undefined;
  isEditable: boolean;
  isPending: boolean;
  onRefresh: () => void;
}) => {
  const translate = useTranslate();
  const [locale] = useLocaleState();

  const converted = lines.filter(
    (line) =>
      line.source_currency != null &&
      line.source_exchange_rate != null &&
      line.source_currency !== version.currency &&
      line.source_currency !== base,
  );
  const byCurrency = new Map<string, QuoteLine>();
  for (const line of converted) {
    if (!byCurrency.has(line.source_currency as string)) {
      byCurrency.set(line.source_currency as string, line);
    }
  }
  const ids = [...byCurrency.values()]
    .map((line) => line.source_exchange_rate_id)
    .filter((id) => id != null);
  const { data: rows } = useGetMany<ExchangeRate>(
    "exchange_rates",
    { ids },
    { enabled: ids.length > 0 },
  );

  if (byCurrency.size === 0) return null;

  const today = serverToday();
  const entries = [...byCurrency.entries()].map(([currency, line]) => {
    const row = rows?.find(
      (rate) => String(rate.id) === String(line.source_exchange_rate_id),
    );
    return {
      currency,
      rate: line.source_exchange_rate as number,
      row,
      isStale:
        version.issued_at == null &&
        (row
          ? rateIsStale({
              kind: row.kind,
              effectiveDate: row.effective_date,
              validUntil: row.valid_until,
              on: today,
              staleAfterDays,
            })
          : line.source_exchange_rate_id == null),
    };
  });
  const anyStale = entries.some((entry) => entry.isStale);

  return (
    <div className="flex flex-col gap-1.5 border-t pt-3">
      <h4 className="text-xs font-medium text-muted-foreground">
        {translate("crm.fx.quote.source_title")}
      </h4>
      <ul className="flex flex-col gap-1 text-sm">
        {entries.map((entry) => (
          <li
            key={entry.currency}
            className="flex flex-wrap items-center gap-2 tabular-nums"
          >
            <span>
              {translate("crm.fx.quote.rate_line", {
                currency: entry.currency,
                base,
                rate: formatRate(entry.rate, locale),
              })}
            </span>
            <span className="text-xs text-muted-foreground">
              {entry.row
                ? translate("crm.fx.quote.effective", {
                    date: formatDay(entry.row.effective_date, locale),
                  })
                : translate("crm.fx.quote.source_unrecorded")}
            </span>
            {entry.isStale ? (
              <ToneBadge tone="warn">
                {translate("crm.fx.status.stale")}
              </ToneBadge>
            ) : null}
          </li>
        ))}
      </ul>
      {anyStale ? (
        <p className="rounded-md bg-warning-tint px-3 py-2 text-xs text-warning">
          {translate("crm.fx.quote.source_stale")}
        </p>
      ) : null}
      {isEditable ? (
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={onRefresh}
          >
            {translate("crm.fx.quote.source_refresh")}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
