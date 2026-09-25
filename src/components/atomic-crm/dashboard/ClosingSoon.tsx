import { AlertTriangle, ArrowRight } from "lucide-react";
import {
  useGetIdentity,
  useGetList,
  useLocaleState,
  useTranslate,
} from "ra-core";
import { useMemo } from "react";
import { Link } from "react-router";

import { ReferenceField } from "@/components/admin/reference-field";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { findDealLabel } from "../deals/dealUtils";
import {
  closeDateStatus,
  closedDealStages,
  parseCalendarDate,
} from "../deals/pipelineFigures";
import { formatRelativeDay } from "../misc/relativeTime";
import { formatMoney } from "../misc/reporting";
import { SectionCard } from "../misc/SectionCard";
import { useTeamScopeFilter } from "../misc/useTeamScopeFilter";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";

/** The horizon a forecast call is usually held on. */
const HORIZON_DAYS = 30;
const ROWS = 5;

/** `Date` -> `YYYY-MM-DD` in local time: `expected_closing_date` is a date. */
const toIsoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

/**
 * The open deals due to close soonest — the list a forecast call walks
 * through — plus, above it, how many open deals are already past their date.
 *
 * The overdue ones are counted, not listed: they are usually old, and five of
 * them would push out the deals that can still be won this month. The count is
 * the alarm; the board is where they get re-dated.
 *
 * Two queries, both excluding decided stages server-side (`stage@not.in`).
 */
export const ClosingSoon = () => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const { identity } = useGetIdentity();
  const teamScope = useTeamScopeFilter();
  const { currency, dealStages, dealPipelineStatuses } =
    useConfigurationContext();

  const now = useMemo(() => new Date(), []);
  const enabled = Number.isInteger(identity?.id);

  const openFilter = useMemo(
    () => ({
      "stage@not.in": `(${closedDealStages(dealPipelineStatuses).join(",")})`,
      "archived_at@is": null,
      ...teamScope,
    }),
    [dealPipelineStatuses, teamScope],
  );
  const today = toIsoDay(now);
  const horizon = toIsoDay(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + HORIZON_DAYS),
  );

  const {
    data: deals,
    total,
    isPending,
  } = useGetList<Deal>(
    "deals",
    {
      pagination: { page: 1, perPage: ROWS },
      sort: { field: "expected_closing_date", order: "ASC" },
      filter: {
        ...openFilter,
        "expected_closing_date@gte": today,
        "expected_closing_date@lte": horizon,
      },
    },
    { enabled },
  );
  const { total: overdue } = useGetList<Deal>(
    "deals",
    {
      pagination: { page: 1, perPage: 1 },
      filter: { ...openFilter, "expected_closing_date@lt": today },
    },
    { enabled },
  );

  return (
    <SectionCard
      title={translate("crm.dashboard.closing.title")}
      subtitle={translate("crm.dashboard.closing.subtitle")}
      contentClassName="p-0"
    >
      {overdue ? (
        <Link
          to="/deals"
          className="flex items-center gap-2 border-b border-border/70 bg-destructive/8 px-4 py-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/12"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="flex-1">
            {translate("crm.dashboard.closing.overdue", {
              smart_count: overdue,
            })}
          </span>
          <ArrowRight className="size-3.5 shrink-0" />
        </Link>
      ) : null}

      {isPending ? (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : !deals?.length ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {translate("crm.dashboard.closing.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border/70">
          {deals.map((deal) => {
            const date = parseCalendarDate(deal.expected_closing_date);
            const isSoon =
              closeDateStatus(deal.expected_closing_date, now) === "soon";
            return (
              <li key={deal.id}>
                <Link
                  to={`/deals/${deal.id}/show`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <ReferenceField
                    record={deal}
                    source="company_id"
                    reference="companies"
                    link={false}
                  >
                    <CompanyAvatar width={20} height={20} />
                  </ReferenceField>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {deal.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {findDealLabel(dealStages, deal.stage)}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney(deal.amount, currency)}
                    </span>
                    <time
                      dateTime={deal.expected_closing_date}
                      title={date.toLocaleDateString(locale, {
                        dateStyle: "long",
                      })}
                      className={cn(
                        "text-xs tabular-nums",
                        isSoon
                          ? "font-medium text-warning"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatRelativeDay(date, locale, now)}
                    </time>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {total != null && total > ROWS ? (
        <Link
          to="/deals"
          className="flex items-center justify-center gap-1.5 border-t border-border/70 px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          {translate("crm.dashboard.closing.more", {
            smart_count: total - ROWS,
          })}
          <ArrowRight className="size-3.5" />
        </Link>
      ) : null}
    </SectionCard>
  );
};
