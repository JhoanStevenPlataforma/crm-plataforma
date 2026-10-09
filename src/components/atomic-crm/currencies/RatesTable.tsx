import { useCanAccess, useLocaleState, useTranslate } from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SectionCard } from "../misc/SectionCard";
import type { CurrentExchangeRate, FxRateKind } from "../types";
import { RateStateBadge } from "./FxBadges";
import {
  formatDay,
  formatInstant,
  formatPercentDiff,
  formatRate,
} from "./fxFormat";
import { ManualRateDialog } from "./ManualRateDialog";
import { useCurrentRates } from "./useFx";

/**
 * The rate in force for every foreign currency, official and commercial side
 * by side, each with its date and source, and its state. A stale rate is
 * shown -- the last valid one is all there is -- but never as current.
 */
export const RatesTable = () => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const { rates, refetch } = useCurrentRates();
  const { canAccess: canAddRate } = useCanAccess({
    resource: "exchange_rates",
    action: "create",
  });
  const [dialog, setDialog] = useState<{
    kind: FxRateKind;
    rate: CurrentExchangeRate;
  } | null>(null);

  const visible = rates.filter((rate) => rate.is_active);

  return (
    <SectionCard title={translate("crm.fx.tabs.rates")} contentClassName="p-0">
      {visible.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          {translate("crm.fx.rates.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{translate("crm.fx.rates.currency")}</TableHead>
                <TableHead className="text-right">
                  {translate("crm.fx.rates.official")}
                </TableHead>
                <TableHead className="text-right">
                  {translate("crm.fx.rates.commercial")}
                </TableHead>
                <TableHead className="text-right">
                  {translate("crm.fx.rates.difference")}
                </TableHead>
                <TableHead>{translate("crm.fx.rates.source")}</TableHead>
                <TableHead>{translate("crm.fx.rates.effective")}</TableHead>
                <TableHead>{translate("crm.fx.rates.state")}</TableHead>
                {canAddRate ? (
                  <TableHead>{translate("crm.fx.rates.actions")}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((rate) => (
                <TableRow key={rate.currency_code}>
                  <TableCell>
                    <div className="font-medium">{rate.currency_code}</div>
                    <div className="text-xs text-muted-foreground">
                      {rate.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRate(rate.official_rate, locale)}
                    <div className="text-xs text-muted-foreground">
                      {rate.base_currency_code}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRate(rate.commercial_rate, locale)}
                    {rate.commercial_valid_until ? (
                      <div className="text-xs text-muted-foreground">
                        {translate("crm.fx.rates.valid_until", {
                          date: formatDay(rate.commercial_valid_until, locale),
                        })}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercentDiff(rate.commercial_diff_percent, locale)}
                  </TableCell>
                  <TableCell>
                    {rate.official_rate == null
                      ? "—"
                      : (rate.official_provider_name ??
                        translate("crm.fx.rates.manual"))}
                    {rate.official_fetched_at ? (
                      <div className="text-xs text-muted-foreground">
                        {translate("crm.fx.rates.updated")}:{" "}
                        {formatInstant(rate.official_fetched_at, locale)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDay(rate.official_effective_date, locale)}
                    {rate.official_age_days != null &&
                    rate.official_age_days > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        {translate("crm.fx.rates.age", {
                          days: rate.official_age_days,
                        })}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <RateStateBadge
                      hasRate={rate.official_rate != null}
                      isStale={rate.official_is_stale}
                    />
                  </TableCell>
                  {canAddRate ? (
                    <TableCell className="whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDialog({ kind: "commercial", rate })
                          }
                        >
                          {translate("crm.fx.rates.set_commercial")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDialog({ kind: "official", rate })}
                        >
                          {translate("crm.fx.rates.enter_official")}
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ManualRateDialog
        open={dialog != null}
        kind={dialog?.kind ?? "commercial"}
        rate={dialog?.rate ?? null}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          refetch();
        }}
      />
    </SectionCard>
  );
};
