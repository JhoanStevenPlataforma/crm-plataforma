import { useTranslate } from "ra-core";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { ReportField, ReportRow } from "../types";

/**
 * The tabular rendering, and the fallback for anything a chart cannot draw.
 *
 * It is not the poor relation of the charts: for a report with four metrics
 * across ten owners, the table IS the readable answer and the grouped bar chart
 * is the compromise. It is offered as a first-class visualisation for that
 * reason rather than as an export format.
 *
 * Sorting is server-side, through the spec, so the arrows here change the query
 * rather than reordering the page. A client-side sort would silently reorder
 * only the rows that survived the executor's limit, which is a different — and
 * wrong — answer to "who sold the most".
 */
export const ReportTable = ({
  dimensions,
  metrics,
  rows,
  formatCell,
  labelOf,
  sort,
  onSort,
  emptyLabel,
}: {
  dimensions: ReportField[];
  metrics: ReportField[];
  rows: ReportRow[];
  /** Owns every formatting decision, so this component holds no currency or
   * locale knowledge of its own. */
  formatCell: (
    kind: "dimension" | "metric",
    field: ReportField,
    row: ReportRow,
  ) => string;
  /** Resolves a column header. Passed in rather than read off the field, so a
   * header and the chart legend for the same metric can never disagree. */
  labelOf: (field: ReportField) => string;
  sort?: { field: string; direction: "asc" | "desc" };
  onSort?: (field: string) => void;
  emptyLabel?: string;
}) => {
  const translate = useTranslate();
  const columns = [
    ...dimensions.map((field) => ({ kind: "dimension" as const, field })),
    ...metrics.map((field) => ({ kind: "metric" as const, field })),
  ];

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground py-8">
            {emptyLabel ?? translate("crm.analytics.no_data")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* The container scrolls, never the page body: a wide report must not
            make the whole layout slide sideways. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                {columns.map(({ kind, field }) => {
                  const active = sort?.field === field.key;
                  return (
                    <th
                      key={field.key}
                      scope="col"
                      className={cn(
                        "font-normal py-2 px-3 border-b whitespace-nowrap",
                        kind === "metric" ? "text-right" : "text-left",
                      )}
                    >
                      {onSort ? (
                        <button
                          type="button"
                          onClick={() => onSort(field.key)}
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-foreground",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm",
                            active && "text-foreground font-medium",
                          )}
                          aria-label={translate("crm.reports.sort_by", {
                            field: labelOf(field),
                          })}
                        >
                          {labelOf(field)}
                          {/* The arrow only renders on the active column: an
                              inactive indicator on every header reads as
                              "sorted by all of these". */}
                          {active ? (
                            <span aria-hidden="true">
                              {sort?.direction === "asc" ? "↑" : "↓"}
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        labelOf(field)
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={Object.values(row.dimensions).join("|") || index}
                  className="border-b last:border-b-0 hover:bg-muted/40"
                >
                  {columns.map(({ kind, field }) => (
                    <td
                      key={field.key}
                      className={cn(
                        "py-2 px-3",
                        kind === "metric"
                          ? "text-right tabular-nums"
                          : "text-left",
                      )}
                    >
                      {formatCell(kind, field, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
