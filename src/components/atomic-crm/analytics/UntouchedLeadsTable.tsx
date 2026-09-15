import { subDays } from "date-fns/subDays";
import { useGetList, useTranslate } from "ra-core";
import { Link } from "react-router";

import { Card, CardContent } from "@/components/ui/card";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Lead } from "../types";
import { labelOf } from "./labels";

const ROWS = 10;

/**
 * How long a lead may sit untouched before it is a problem.
 *
 * Seven days, not thirty: a lead that filled in a web form and heard nothing
 * for a month has already bought elsewhere, so a threshold that only flags them
 * then is a report rather than a task list.
 */
const STALE_DAYS = 7;

/**
 * Leads still in `new` that nobody has touched.
 *
 * Like the past-due deals table, this needs no backend: it is a filter over the
 * `leads` resource. It is also the only thing on the Leads tab a user can act
 * on directly — everything else there explains what already happened.
 */
export const UntouchedLeadsTable = ({
  salesId,
}: {
  salesId: number | null;
}) => {
  const translate = useTranslate();
  const { leadSources } = useConfigurationContext();
  const cutoff = subDays(new Date(), STALE_DAYS).toISOString();

  const filter: Record<string, unknown> = {
    "status@eq": "new",
    "created_at@lt": cutoff,
  };
  if (salesId != null) filter["sales_id@eq"] = salesId;

  const { data, total, error } = useGetList<Lead>("leads", {
    filter,
    sort: { field: "created_at", order: "ASC" },
    pagination: { page: 1, perPage: ROWS },
  });

  const rows = data ?? [];

  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-medium">
              {translate("crm.analytics.untouched.title")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {translate("crm.analytics.untouched.subtitle", {
                days: STALE_DAYS,
              })}
            </p>
          </div>
          {total != null && total > rows.length ? (
            <Link
              to={`/leads?filter=${encodeURIComponent(JSON.stringify(filter))}`}
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
            {translate("crm.analytics.untouched.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground text-left">
                  <th className="font-normal py-1">
                    {translate("crm.analytics.untouched.lead")}
                  </th>
                  <th className="font-normal py-1">
                    {translate("crm.analytics.untouched.company")}
                  </th>
                  <th className="font-normal py-1">
                    {translate("crm.analytics.untouched.source")}
                  </th>
                  <th className="font-normal py-1">
                    {translate("crm.analytics.untouched.arrived")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((lead) => (
                  <tr key={lead.id} className="border-t">
                    <td className="py-1.5">
                      <Link
                        to={`/leads/${lead.id}/show`}
                        className="underline underline-offset-4"
                      >
                        {`${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() ||
                          translate("crm.analytics.untouched.unnamed")}
                      </Link>
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      {lead.company_name || "—"}
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      {lead.source ? labelOf(leadSources, lead.source) : "—"}
                    </td>
                    <td className="py-1.5 text-muted-foreground tabular-nums">
                      {lead.created_at.slice(0, 10)}
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
