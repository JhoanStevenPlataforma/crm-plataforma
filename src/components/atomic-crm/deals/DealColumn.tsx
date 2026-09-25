import { Droppable } from "@hello-pangea/dnd";
import { useTranslate } from "ra-core";

import { cn } from "@/lib/utils";

import { useChartPalette } from "../misc/chartTheme";
import { formatMoney } from "../misc/reporting";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { findDealLabel, findDealProbability } from "./dealUtils";
import { DealCard } from "./DealCard";

const percent = (value: number) =>
  value.toLocaleString("en-US", { style: "percent", maximumFractionDigits: 0 });

/**
 * One stage of the board.
 *
 * The header carries the stage the way a forecast reads it: the money in it
 * (the largest figure, since it is what the column is for), what that money is
 * worth at the stage's probability, and — for open stages — a hairline showing
 * how much of the whole open pipeline sits here. The count is a badge beside
 * the name, secondary to the amount.
 *
 * Closed stages keep their meaning in their edge colour: green where deals
 * land, the destructive red, muted, where they are lost. Neither shows a
 * probability or a share: a decided deal is not a forecast.
 */
export const DealColumn = ({
  stage,
  deals,
  openAmount,
  isClosed,
}: {
  stage: string;
  deals: Deal[];
  /** The whole open pipeline, for this column's share of it. */
  openAmount: number;
  isClosed: boolean;
}) => {
  const translate = useTranslate();
  const { dealStages, dealPipelineStatuses, currency } =
    useConfigurationContext();
  const palette = useChartPalette();
  const totalAmount = deals.reduce((sum, deal) => sum + deal.amount, 0);
  // Read from the configuration, never a literal "won": stage values are free
  // text and an installation may rename them (see AGENTS.md, stage gate).
  const isWon = dealPipelineStatuses.includes(stage);
  const probability = isClosed ? null : findDealProbability(dealStages, stage);
  const share = !isClosed && openAmount > 0 ? totalAmount / openAmount : 0;

  return (
    <section
      aria-label={findDealLabel(dealStages, stage)}
      className={cn(
        "relative flex min-w-[16.5rem] flex-1 basis-0 flex-col self-start overflow-hidden rounded-2xl border border-border/60 bg-muted/45 dark:border-border/50 dark:bg-black/25",
        isClosed && !isWon && "bg-muted/25 dark:bg-black/15",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-[3px]",
          isWon
            ? "bg-success"
            : isClosed
              ? "bg-destructive/60"
              : "bg-[linear-gradient(90deg,var(--brand-subtle),var(--brand))]",
        )}
      />

      <header className="flex flex-col gap-2 px-3.5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          {/* The stage name is the column's heading and reads first: larger
              and bolder than anything else in the header, keyed by a dot in
              the lane's colour (amber in flight, green won, red lost) and a
              count badge tinted to match. */}
          <h3 className="flex min-w-0 items-center gap-2.5 text-lg leading-tight font-bold tracking-tight">
            <span
              aria-hidden
              className={cn(
                "size-2.5 shrink-0 rounded-full ring-4",
                isWon
                  ? "bg-success ring-success/15"
                  : isClosed
                    ? "bg-destructive ring-destructive/15"
                    : "bg-brand ring-brand/15",
              )}
            />
            <span className="truncate">{findDealLabel(dealStages, stage)}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                isWon
                  ? "bg-success/12 text-success"
                  : isClosed
                    ? "bg-destructive/12 text-destructive"
                    : "bg-brand-tint text-brand-strong",
              )}
            >
              {deals.length}
            </span>
          </h3>
          {probability != null ? (
            <span
              className="shrink-0 rounded-md bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums dark:bg-surface-muted"
              title={translate("resources.deals.board.probability", {
                value: percent(probability),
              })}
            >
              {percent(probability)}
            </span>
          ) : null}
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "text-lg font-semibold tracking-tight tabular-nums",
              isWon && "text-success",
              isClosed && !isWon && "text-muted-foreground",
            )}
          >
            {formatMoney(totalAmount, currency)}
          </p>
          {probability != null && totalAmount > 0 ? (
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {translate("resources.deals.board.weighted_short", {
                amount: formatMoney(totalAmount * probability, currency),
              })}
            </p>
          ) : null}
        </div>

        {!isClosed ? (
          <div
            className="h-1 overflow-hidden rounded-full bg-border/70"
            title={translate("resources.deals.board.share", {
              value: percent(share),
            })}
          >
            <div
              // The in-flight chart hue, as in the stage bar above the board.
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%`,
                backgroundColor: palette.inFlight,
              }}
            />
          </div>
        ) : null}
      </header>

      <Droppable droppableId={stage}>
        {(droppableProvided, snapshot) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={cn(
              // No `gap` here: the drag library shifts neighbours by each card's
              // own box and does not see a flex gap, so cards overlapped mid-drag.
              // The spacing lives inside each draggable (see `DealCardContent`).
              "mx-2 mb-2 flex min-h-28 flex-col rounded-xl transition-colors",
              snapshot.isDraggingOver &&
                "bg-brand-tint/60 ring-1 ring-brand/30",
            )}
          >
            {deals.map((deal, index) => (
              <DealCard key={deal.id} deal={deal} index={index} />
            ))}
            {deals.length === 0 && !snapshot.isDraggingOver ? (
              <p className="grid min-h-28 place-items-center rounded-xl border border-dashed border-border-strong/70 px-4 text-center text-xs text-muted-foreground">
                {translate("resources.deals.board.drop_here")}
              </p>
            ) : null}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
    </section>
  );
};
