import { BarChart3, Table2 } from "lucide-react";
import { useTranslate } from "ra-core";
import { useState, type ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { ChartDataTable, type ChartTable } from "./ChartDataTable";

export interface ChartLegendItem {
  label: string;
  color: string;
}

/**
 * The frame every chart on a reporting screen sits in.
 *
 * Extracted so the empty state is written once. It matters more than it looks:
 * a chart with no data must say so, because an empty plot area reads as "zero"
 * and zero is a claim about the business, not about the query.
 *
 * `subtitle` carries the date basis ("by expected closing date", "by completion
 * month"). It is not decoration: two charts on one screen measured on different
 * dates, both captioned only "this quarter", is the fastest way for a dashboard
 * to lose its reader's trust.
 *
 * `legend` is drawn in the header, beside the title, rather than under the
 * plot: it is read before the bars, and the plot keeps its full height.
 *
 * `table` adds a Chart / Table switch. It is how a figure stays reachable
 * without hovering, since a 24px column cannot hold its own label.
 */
export const ChartCard = ({
  title,
  subtitle,
  isEmpty,
  emptyLabel,
  children,
  height = 280,
  legend,
  table,
}: {
  title: string;
  subtitle?: string;
  isEmpty: boolean;
  /** Defaults to the shared "nothing to report in this period" message. */
  emptyLabel?: string;
  children: ReactNode;
  height?: number;
  /** Two or more series. A single series needs none: the title names it. */
  legend?: ChartLegendItem[];
  table?: ChartTable;
}) => {
  const translate = useTranslate();
  const [view, setView] = useState<"chart" | "table">("chart");
  const showTable = view === "table" && table != null && !isEmpty;

  return (
    // Same header as `SectionCard`, so a chart and a list panel side by side
    // have their titles on one line and their bodies start at one height.
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border/70 px-4 py-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {legend && legend.length > 1 && !isEmpty ? (
            <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
              {legend.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-[3px]"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}
          {table && !isEmpty ? (
            <div
              role="group"
              aria-label={translate("crm.analytics.view.label")}
              className="flex items-center rounded-md bg-muted p-0.5"
            >
              <ViewButton
                active={view === "chart"}
                onClick={() => setView("chart")}
                label={translate("crm.analytics.view.chart")}
              >
                <BarChart3 className="size-3.5" />
              </ViewButton>
              <ViewButton
                active={view === "table"}
                onClick={() => setView("table")}
                label={translate("crm.analytics.view.table")}
              >
                <Table2 className="size-3.5" />
              </ViewButton>
            </div>
          ) : null}
        </div>
      </div>
      <CardContent className="p-4">
        {isEmpty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {emptyLabel ?? translate("crm.analytics.no_data")}
          </p>
        ) : showTable ? (
          <div className="overflow-auto" style={{ maxHeight: height }}>
            <ChartDataTable table={table} />
          </div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
};

const ViewButton = ({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    aria-label={label}
    title={label}
    className={cn(
      "grid size-6 place-items-center rounded-[5px] text-muted-foreground transition-colors hover:text-foreground",
      active && "bg-card text-foreground shadow-card",
    )}
  >
    {children}
  </button>
);
