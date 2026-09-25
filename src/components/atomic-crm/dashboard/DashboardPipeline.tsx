import { ArrowRight } from "lucide-react";
import { useTranslate } from "ra-core";
import { Link } from "react-router";

import { Skeleton } from "@/components/ui/skeleton";

import { weightedPipeline } from "../analytics/dealAnalytics";
import { findDealLabel, findDealProbability } from "../deals/dealUtils";
import { closedDealStages, stageOpacity } from "../deals/pipelineFigures";
import { useChartPalette } from "../misc/chartTheme";
import { formatMoney } from "../misc/reporting";
import { SectionCard } from "../misc/SectionCard";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { DealStageStat } from "../types";

const percent = (value: number) =>
  value.toLocaleString("en-US", { style: "percent", maximumFractionDigits: 0 });

/**
 * Where the open money sits, stage by stage — the dashboard's view of the
 * board, read from the same `deal_stage_stats` aggregate as the weighted
 * pipeline KPI above it, so the two always add up.
 *
 * A ranked bar list rather than a funnel drawing: the stages are not a strict
 * funnel (a deal can skip one, or sit in "delayed"), and a funnel's tapering
 * shape would claim a conversion the data does not measure. One hue stepping
 * light to dark in board order, as on the board's own summary band.
 */
export const DashboardPipeline = ({
  stages,
  isPending,
}: {
  stages: DealStageStat[] | undefined;
  isPending: boolean;
}) => {
  const translate = useTranslate();
  const { currency, dealStages, dealPipelineStatuses } =
    useConfigurationContext();
  const palette = useChartPalette();

  const closed = closedDealStages(dealPipelineStatuses);
  const openStages = dealStages.filter(
    (stage) => !closed.includes(stage.value),
  );
  const rows = openStages.map((stage) => {
    const stat = stages?.find((row) => row.stage === stage.value);
    return {
      stage: stage.value,
      amount: stat?.amount ?? 0,
      count: stat?.nb_deals ?? 0,
      probability: findDealProbability(dealStages, stage.value),
    };
  });
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const largest = Math.max(...rows.map((row) => row.amount), 0);
  const weighted = weightedPipeline(stages, dealStages);

  return (
    <SectionCard
      title={translate("crm.dashboard.pipeline.title")}
      subtitle={translate("crm.dashboard.pipeline.subtitle")}
      contentClassName="p-0"
    >
      {isPending ? (
        <div className="flex flex-col gap-4 p-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : total === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {translate("crm.dashboard.pipeline.empty")}
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {formatMoney(total, currency)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {translate("crm.dashboard.pipeline.weighted", {
                amount: formatMoney(weighted.amount, currency),
              })}
            </p>
          </div>
          <ul className="flex flex-col gap-3.5 px-4 pt-3 pb-4">
            {rows.map((row, index) => (
              <li key={row.stage} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">
                      {findDealLabel(dealStages, row.stage)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {row.count}
                      {row.probability != null
                        ? ` · ${percent(row.probability)}`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatMoney(row.amount, currency)}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {percent(total > 0 ? row.amount / total : 0)}
                    </span>
                  </span>
                </div>
                {/* Scaled to the largest stage, so the biggest bar fills the
                    row and the rest read against it. */}
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${largest > 0 ? (row.amount / largest) * 100 : 0}%`,
                      backgroundColor: palette.inFlight,
                      opacity: stageOpacity(index, rows.length),
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <Link
            to="/deals"
            className="flex items-center justify-center gap-1.5 border-t border-border/70 px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            {translate("crm.dashboard.pipeline.view_board")}
            <ArrowRight className="size-3.5" />
          </Link>
        </>
      )}
    </SectionCard>
  );
};
