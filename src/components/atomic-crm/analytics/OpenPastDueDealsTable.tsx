import { useGetList, useTranslate } from "ra-core";
import { Link } from "react-router";

import { Card, CardContent } from "@/components/ui/card";

import { formatMoney } from "../misc/reporting";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { labelOf, openStageKeys } from "./labels";

const ROWS = 10;

/**
 * Deals whose expected closing date has passed and that are still open.
 *
 * The one genuinely actionable thing on the overview, and it costs no backend:
 * it is a filter over the `deals` resource that already exists. Every deal here
 * makes the forecast above it wrong — the money is booked into a month that has
 * already gone — so the fix is to re-date it or close it, and both are one
 * click away.
 *
 * `stage@in` over the OPEN stages rather than `@not.in` over the terminal ones:
 * the FakeRest adapter has no `@not.in`, and deriving the list from the
 * configuration is also what makes a renamed stage keep working.
 */
export const OpenPastDueDealsTable = ({
  salesId,
  teamId,
}: {
  salesId: number | null;
  teamId: number | null;
}) => {
  const translate = useTranslate();
  const { currency, dealStages } = useConfigurationContext();
  const today = new Date().toISOString().slice(0, 10);

  const filter: Record<string, unknown> = {
    "expected_closing_date@lt": today,
    "stage@in": `(${openStageKeys(dealStages).join(",")})`,
    "archived_at@is": null,
  };
  if (salesId != null) filter["sales_id@eq"] = salesId;
  if (teamId != null) filter["team_id@eq"] = teamId;

  const { data, total, error } = useGetList<Deal>("deals", {
    filter,
    sort: { field: "amount", order: "DESC" },
    pagination: { page: 1, perPage: ROWS },
  });

  const rows = data ?? [];

  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-medium">
              {translate("crm.analytics.past_due.title")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {translate("crm.analytics.past_due.subtitle")}
            </p>
          </div>
          {/* Past the tenth row the table stops being the whole answer, so it
              says so and hands over to the list rather than quietly truncating. */}
          {total != null && total > rows.length ? (
            <Link
              to={`/deals?filter=${encodeURIComponent(JSON.stringify(filter))}`}
              className="text-sm underline underline-offset-4"
            >
              {translate("crm.analytics.past_due.see_all", { total })}
            </Link>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-destructive">
            {translate("crm.analytics.load_error")}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {translate("crm.analytics.past_due.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground text-left">
                  <th className="font-normal py-1">
                    {translate("crm.analytics.past_due.deal")}
                  </th>
                  <th className="font-normal py-1">
                    {translate("crm.analytics.past_due.stage")}
                  </th>
                  <th className="font-normal py-1">
                    {translate("crm.analytics.past_due.expected")}
                  </th>
                  <th className="font-normal py-1 text-right">
                    {translate("crm.analytics.past_due.amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((deal) => (
                  <tr key={deal.id} className="border-t">
                    <td className="py-1.5">
                      <Link
                        to={`/deals/${deal.id}/show`}
                        className="underline underline-offset-4"
                      >
                        {deal.name}
                      </Link>
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      {labelOf(dealStages, deal.stage)}
                    </td>
                    <td className="py-1.5 text-muted-foreground tabular-nums">
                      {deal.expected_closing_date}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatMoney(deal.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
