import { endOfMonth } from "date-fns/endOfMonth";
import { endOfQuarter } from "date-fns/endOfQuarter";
import { endOfYear } from "date-fns/endOfYear";
import { startOfMonth } from "date-fns/startOfMonth";
import { startOfQuarter } from "date-fns/startOfQuarter";
import { startOfYear } from "date-fns/startOfYear";
import { subMonths } from "date-fns/subMonths";
import { subQuarters } from "date-fns/subQuarters";
import { subYears } from "date-fns/subYears";
import { z } from "zod";

import type {
  ReportDataset,
  ReportDataType,
  ReportFilterOp,
  ReportPeriod,
  ReportPreset,
  ReportSpec,
} from "../types";

/**
 * The report spec: presets, validation, and the URL round trip.
 *
 * Everything here is pure and date-injectable, so the tests do not depend on
 * the day they run — the same rule `analyticsFilters.ts` follows, for the same
 * reason.
 *
 * The spec is the module's only untrusted input surface: it arrives from a
 * hand-editable URL and from a `jsonb` column, and it ends up as parameters to
 * a SQL-composing function. The database refuses anything outside its
 * catalogue regardless, so this layer exists to fail EARLY and legibly rather
 * than to be the security boundary — a bad link should render the builder with
 * a default report, not an error page.
 */

export const REPORT_PRESETS: ReportPreset[] = [
  "this_month",
  "last_month",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
  "custom",
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `Date` -> `YYYY-MM-DD`, in local time — the same day the user picked. */
const toIsoDay = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * A preset resolved against today.
 *
 * Ranges always start and end on a period boundary. Half a month at each end
 * makes the first and last bars of a monthly chart shorter than the others for
 * a reason the axis does not show, which reads as a drop in the business rather
 * than as a truncated bucket.
 *
 * `custom` returns the stored dates untouched — it is the one preset that does
 * not slide, which is the whole point of offering it.
 */
export const resolvePeriod = (
  period: ReportPeriod | undefined,
  today: Date = new Date(),
): { from: string; to: string } | null => {
  if (!period) return null;

  const monthsBack = (count: number) => ({
    from: toIsoDay(startOfMonth(subMonths(today, count - 1))),
    to: toIsoDay(endOfMonth(today)),
  });

  switch (period.preset) {
    case "custom":
      // A custom range with a missing or reversed end is not an empty report,
      // it is an unfinished one: fall back rather than querying a range that
      // matches nothing.
      return period.from && period.to && period.from <= period.to
        ? { from: period.from, to: period.to }
        : null;
    case "this_month":
      return monthsBack(1);
    case "last_month": {
      const previous = subMonths(today, 1);
      return {
        from: toIsoDay(startOfMonth(previous)),
        to: toIsoDay(endOfMonth(previous)),
      };
    }
    case "last_3_months":
      return monthsBack(3);
    case "last_6_months":
      return monthsBack(6);
    case "last_12_months":
      return monthsBack(12);
    case "this_quarter":
      return {
        from: toIsoDay(startOfQuarter(today)),
        to: toIsoDay(endOfQuarter(today)),
      };
    case "last_quarter": {
      const previous = subQuarters(today, 1);
      return {
        from: toIsoDay(startOfQuarter(previous)),
        to: toIsoDay(endOfQuarter(previous)),
      };
    }
    case "this_year":
      return {
        from: toIsoDay(startOfYear(today)),
        to: toIsoDay(endOfYear(today)),
      };
    case "last_year": {
      const previous = subYears(today, 1);
      return {
        from: toIsoDay(startOfYear(previous)),
        to: toIsoDay(endOfYear(previous)),
      };
    }
    default:
      return null;
  }
};

/**
 * The same period shifted back by its own length, for period comparison.
 *
 * Derived from the RESOLVED range rather than from the preset, so a custom
 * range compares against the equivalent stretch before it and every preset gets
 * comparison for free. Inclusive ranges, so the shift is the day count plus
 * one — off by one here would overlap the two periods by a day and silently
 * double-count whatever happened on it.
 */
export const previousPeriod = (range: {
  from: string;
  to: string;
}): { from: string; to: string } => {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

  const shift = (date: Date) => {
    const shifted = new Date(date);
    shifted.setDate(shifted.getDate() - days);
    return toIsoDay(shifted);
  };

  return { from: shift(from), to: shift(to) };
};

/**
 * Which operators the filter builder offers for a field.
 *
 * Mirrors `report_filter_sql`'s allowlist exactly. It is duplicated because the
 * two layers answer different questions — the database REFUSES, this OFFERS —
 * and the pgTAP suite pins the database side, so a divergence surfaces as a
 * filter the UI shows and the server rejects rather than as a silent hole.
 */
export const operatorsFor = (dataType: ReportDataType): ReportFilterOp[] => {
  if (dataType === "text") {
    return [
      "eq",
      "neq",
      "contains",
      "not_contains",
      "in",
      "not_in",
      "is_null",
      "is_not_null",
    ];
  }
  if (dataType === "date" || dataType === "month") {
    return ["eq", "before", "after", "between", "is_null", "is_not_null"];
  }
  return [
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "is_null",
    "is_not_null",
  ];
};

/** Operators that take no value at all. */
export const isValuelessOp = (op: ReportFilterOp): boolean =>
  op === "is_null" || op === "is_not_null";

/** Operators whose value is a list rather than a scalar. */
export const isListOp = (op: ReportFilterOp): boolean =>
  op === "in" || op === "not_in" || op === "between";

const filterSchema = z.object({
  field: z.string().min(1),
  op: z.enum([
    "eq",
    "neq",
    "contains",
    "not_contains",
    "in",
    "not_in",
    "gt",
    "gte",
    "lt",
    "lte",
    "before",
    "after",
    "between",
    "is_null",
    "is_not_null",
  ]),
  value: z
    .union([
      z.string(),
      z.number(),
      z.array(z.union([z.string(), z.number()])),
      z.null(),
    ])
    .optional(),
});

const periodSchema = z.object({
  field: z.string().min(1),
  preset: z.enum([
    "this_month",
    "last_month",
    "last_3_months",
    "last_6_months",
    "last_12_months",
    "this_quarter",
    "last_quarter",
    "this_year",
    "last_year",
    "custom",
  ]),
  from: z.string().regex(DATE_PATTERN).optional(),
  to: z.string().regex(DATE_PATTERN).optional(),
});

/**
 * The spec schema.
 *
 * The caps match the executor's (`at most two dimensions`, `six metrics`,
 * `twelve filters`) so a spec that would be refused by the database is refused
 * here first, with a message a person can act on.
 *
 * `dimensions` and `filters` PARSE AS ABSENT and default to empty, which is not
 * a convenience — it is the fix for a real bug. The executor treats both as
 * optional, so a stored spec is free to omit them, and fifteen of the seeded
 * built-in reports did exactly that. Requiring them here made `parseSpec`
 * return null for every one of those, and the page reported "this report does
 * not exist" for a report that was sitting right there in the library.
 *
 * The rule this encodes: a spec that the DATABASE would accept must parse. This
 * layer exists to catch mistakes early and legibly, never to be stricter than
 * the thing it guards.
 */
export const reportSpecSchema = z.object({
  dataset: z.string().min(1),
  metrics: z.array(z.string().min(1)).min(1).max(6),
  dimensions: z.array(z.string().min(1)).max(2).default([]),
  filters: z.array(filterSchema).max(12).default([]),
  period: periodSchema.optional(),
  sort: z
    .object({
      field: z.string().min(1),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  visualisation: z.enum([
    "kpi",
    "table",
    "bar",
    "stacked",
    "ranking",
    "funnel",
    "donut",
  ]),
});

/**
 * The schema's output must stay exactly `ReportSpec`.
 *
 * Checked at compile time rather than by annotating the schema, because the
 * defaults above make the INPUT type differ from the output — an annotation
 * would have to describe both, and getting that wrong silently is how the
 * required-`filters` bug shipped in the first place. This assignment fails to
 * typecheck the moment the two drift.
 */
const _specShapeMatchesWireType: ReportSpec = {} as z.infer<
  typeof reportSpecSchema
>;
void _specShapeMatchesWireType;

/**
 * A spec for a dataset with nothing selected yet.
 *
 * Picks the first metric the catalogue offers rather than leaving it empty:
 * the executor refuses a report with no metric, so an empty builder would open
 * on an error. It opens on the simplest true report instead — how many of these
 * are there.
 */
export const emptySpec = (dataset: ReportDataset): ReportSpec => {
  const firstMetric = dataset.fields.find((f) => f.role === "metric");

  return {
    dataset: dataset.key,
    metrics: firstMetric ? [firstMetric.key] : [],
    dimensions: [],
    filters: [],
    period: dataset.default_date_field
      ? { field: dataset.default_date_field, preset: "last_6_months" }
      : undefined,
    visualisation: "kpi",
  };
};

/**
 * Parse a spec from an untrusted source (a URL, a `jsonb` column).
 *
 * Returns null rather than throwing: a malformed link should land the user in
 * the library, not on a stack trace.
 */
export const parseSpec = (value: unknown): ReportSpec | null => {
  const parsed = reportSpecSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/**
 * Check a spec against the catalogue the server actually published.
 *
 * The schema above proves the spec is well FORMED; this proves it is
 * MEANINGFUL. Both are needed: a spec asking to group deals by `sector_name`
 * parses perfectly and is still refused by the executor, and finding that out
 * from a red toast after a round trip is worse than finding out in the panel.
 */
export const validateAgainstCatalog = (
  spec: ReportSpec,
  dataset: ReportDataset | undefined,
): string | null => {
  if (!dataset) return "unknown_dataset";

  const byKey = new Map(dataset.fields.map((field) => [field.key, field]));

  for (const key of spec.metrics) {
    if (byKey.get(key)?.role !== "metric") return "unknown_metric";
  }
  for (const key of spec.dimensions) {
    if (byKey.get(key)?.role !== "dimension") return "unknown_dimension";
  }
  for (const filter of spec.filters) {
    const field = byKey.get(filter.field);
    if (!field?.filterable || field.role !== "dimension") {
      return "unknown_filter_field";
    }
    if (!operatorsFor(field.data_type).includes(filter.op)) {
      return "bad_operator";
    }
  }
  if (spec.period) {
    const field = byKey.get(spec.period.field);
    if (!field || (field.data_type !== "date" && field.data_type !== "month")) {
      return "bad_period_field";
    }
  }
  if (spec.sort) {
    const selected = [...spec.metrics, ...spec.dimensions];
    if (!selected.includes(spec.sort.field)) return "bad_sort";
  }

  // A grouped visualisation with nothing to group by draws one bar and reads as
  // a broken chart. Caught here so the panel can say which of the two to fix.
  if (spec.visualisation !== "kpi" && spec.visualisation !== "table") {
    if (spec.dimensions.length === 0) return "needs_dimension";
  }
  if (spec.visualisation === "donut" || spec.visualisation === "funnel") {
    if (spec.metrics.length !== 1) return "needs_single_metric";
  }
  if (spec.visualisation === "stacked" && spec.dimensions.length !== 2) {
    return "needs_two_dimensions";
  }

  return null;
};

/**
 * The spec, packed into the URL.
 *
 * One base64 parameter rather than a dozen readable ones. A spec is a nested
 * document — filters are objects inside an array — and flattening that into
 * query parameters produces `filters[0][op]=in&filters[0][value][]=won`, which
 * is both unreadable and ambiguous to parse back. The link is for sharing and
 * for the back button, not for hand-editing; `parseSpec` treats whatever comes
 * back as untrusted either way.
 */
export const specToParam = (spec: ReportSpec): string =>
  btoa(encodeURIComponent(JSON.stringify(spec)));

export const specFromParam = (param: string | null): ReportSpec | null => {
  if (!param) return null;
  try {
    return parseSpec(JSON.parse(decodeURIComponent(atob(param))));
  } catch {
    return null;
  }
};

/**
 * What actually goes to `run_report()`.
 *
 * The preset is resolved here and never crosses the boundary: the database
 * receives two dates and has no opinion about what "last quarter" means, which
 * keeps the calendar logic in one testable place instead of split across a
 * function and a plpgsql body.
 */
export const specToRpcParams = (
  spec: ReportSpec,
  today: Date = new Date(),
  overrideRange?: { from: string; to: string },
): Record<string, unknown> => {
  const range = overrideRange ?? resolvePeriod(spec.period, today);

  return {
    p_spec: {
      dataset: spec.dataset,
      metrics: spec.metrics,
      dimensions: spec.dimensions,
      filters: spec.filters,
      ...(spec.period && range
        ? { period: { field: spec.period.field, ...range } }
        : {}),
      ...(spec.sort ? { sort: spec.sort } : {}),
      ...(spec.limit ? { limit: spec.limit } : {}),
    },
  };
};
