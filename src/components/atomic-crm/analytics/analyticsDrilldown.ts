import { reportBuilderPath } from "../reports/reportsPath";
import { specToParam } from "../reports/reportSpec";
import type { ReportFilter, ReportSpec } from "../types";
import type { AnalyticsFilters } from "./analyticsFilters";

/**
 * The bridge from a summary figure to the report that explains it.
 *
 * This is the whole relationship between the two modules: `/analytics` is where
 * a problem is NOTICED — one number, no configuration, four tabs — and
 * `/reports` is where it is TAKEN APART. A dashboard that can only be looked at
 * makes the reader go and rebuild the question by hand, and most of them do not
 * bother, which is how a "win rate: 27 %" tile ends up being read for a year
 * without anyone finding out whose.
 *
 * Every link carries the period the reader was already looking at. Handing over
 * a report scoped to a different range than the tile they clicked is worse than
 * handing over nothing: the two numbers disagree and the reader has no way to
 * see why.
 *
 * The specs are built here rather than stored as built-in reports because they
 * are PARAMETERISED by the filter bar. A stored report has a fixed period and a
 * fixed owner filter; these inherit both from the screen they were clicked on.
 */

/** The analytics filter bar, as report filters. */
const ownerFilters = (filters: AnalyticsFilters): ReportFilter[] => {
  const list: ReportFilter[] = [];
  // Deliberately NOT translated into an owner filter: the analytics bar carries
  // a `sales_id`, while the report catalogue exposes `owner` as a resolved
  // NAME. Filtering by name would break on two people called the same thing.
  // The drill-downs below GROUP BY owner instead, which is the more useful
  // answer anyway — "whose" rather than "is it this person's".
  if (filters.teamId != null) {
    // No team dimension outside deals, so callers that offer this must be on a
    // deals dataset. Kept as a helper so the rule lives in one place.
    list.push({ field: "team", op: "is_not_null" });
  }
  return list;
};

const withPeriod = (
  spec: Omit<ReportSpec, "period">,
  filters: AnalyticsFilters,
  field: string,
): ReportSpec => ({
  ...spec,
  // `custom` rather than a preset: the reader picked these exact dates on the
  // bar above, and a preset would slide away from them the moment the report is
  // saved or opened tomorrow.
  period: { field, preset: "custom", from: filters.from, to: filters.to },
});

/** Where does the open pipeline sit, and with whom? */
export const pipelineDrilldown = (filters: AnalyticsFilters): string =>
  reportBuilderPath(
    specToParam({
      dataset: "deals",
      metrics: ["pipeline_amount", "deal_count"],
      dimensions: ["stage", "owner"],
      filters: [
        { field: "stage", op: "not_in", value: ["won", "lost"] },
        ...ownerFilters(filters),
      ],
      sort: { field: "pipeline_amount", direction: "desc" },
      visualisation: "stacked",
    }),
  );

/** Which revenue, from whom, in the period on screen. */
export const wonDrilldown = (filters: AnalyticsFilters): string =>
  reportBuilderPath(
    specToParam(
      withPeriod(
        {
          dataset: "deals",
          metrics: ["won_amount", "won_count", "amount_avg"],
          dimensions: ["owner"],
          filters: [
            { field: "stage", op: "eq", value: "won" },
            ...ownerFilters(filters),
          ],
          sort: { field: "won_amount", direction: "desc" },
          visualisation: "ranking",
        },
        filters,
        "expected_closing_date",
      ),
    ),
  );

/**
 * Whose win rate, and against what volume.
 *
 * The counts travel with the rate on purpose: a 100 % win rate over one deal
 * and a 60 % rate over fifty are the same column on a chart and completely
 * different facts, so the table shows all three.
 */
export const winRateDrilldown = (filters: AnalyticsFilters): string =>
  reportBuilderPath(
    specToParam(
      withPeriod(
        {
          dataset: "deals",
          metrics: ["win_rate", "won_count", "lost_count"],
          dimensions: ["owner"],
          filters: ownerFilters(filters),
          sort: { field: "win_rate", direction: "desc" },
          visualisation: "table",
        },
        filters,
        "expected_closing_date",
      ),
    ),
  );

/** Where the prospects came from, and how they performed. */
export const leadsDrilldown = (filters: AnalyticsFilters): string =>
  reportBuilderPath(
    specToParam(
      withPeriod(
        {
          dataset: "leads",
          metrics: ["lead_count", "converted_count", "conversion_rate"],
          dimensions: ["source"],
          filters: [],
          sort: { field: "lead_count", direction: "desc" },
          visualisation: "table",
        },
        filters,
        "created_at",
      ),
    ),
  );

/** Which channels actually convert. */
export const conversionDrilldown = (filters: AnalyticsFilters): string =>
  reportBuilderPath(
    specToParam(
      withPeriod(
        {
          dataset: "leads",
          metrics: [
            "conversion_rate",
            "lead_count",
            "converted_count",
            "won_amount",
          ],
          dimensions: ["source"],
          filters: [],
          sort: { field: "conversion_rate", direction: "desc" },
          visualisation: "table",
        },
        filters,
        "created_at",
      ),
    ),
  );

/**
 * Who is carrying the late work.
 *
 * No period, and that is the point: being overdue has no month. The tile it
 * hangs off is not period-scoped either, so a report that suddenly was would
 * disagree with the number the reader just clicked.
 */
export const overdueDrilldown = (): string =>
  reportBuilderPath(
    specToParam({
      dataset: "tasks",
      metrics: ["overdue_count", "open_count"],
      dimensions: ["owner"],
      filters: [],
      sort: { field: "overdue_count", direction: "desc" },
      visualisation: "ranking",
    }),
  );
