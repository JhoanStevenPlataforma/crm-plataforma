/**
 * The reports module's wire types.
 *
 * Two documents cross the boundary and both are defined here so the builder and
 * the executor cannot drift: the CATALOGUE (what is expressible) comes back
 * from `report_catalog()`, and the SPEC (what was asked for) goes out to
 * `run_report()`.
 *
 * The spec is deliberately the same object in three places — the URL, the
 * `reports.spec` column, and the RPC parameter. A report that had to be
 * transformed between them would eventually be transformed differently in one
 * of the three.
 */

/** What a field can be used for. Enforced by the database, not only here. */
export type ReportFieldRole = "dimension" | "metric";

/**
 * Drives which operators the filter builder offers and how a value is
 * formatted. `month` is a date the catalogue already truncated, kept separate
 * from `date` so the axis can print "Mar 2026" rather than "2026-03-01".
 */
export type ReportDataType = "text" | "number" | "money" | "date" | "month";

export type ReportField = {
  key: string;
  label: string;
  role: ReportFieldRole;
  data_type: ReportDataType;
  /** Null for dimensions. Informational here — the database applies it. */
  aggregate: string | null;
  filterable: boolean;
  /**
   * Names a list in `ConfigurationContext` (`dealStages`, `leadSources`,
   * `leadStatuses`, `dealCategories`) that turns this dimension's raw key into
   * a human label. Resolved in the browser because `deals.stage` is free text
   * and its vocabulary is application configuration, not a database table.
   */
  label_source: string | null;
};

export type ReportDataset = {
  key: string;
  label: string;
  /** Field key the period filter uses when the spec does not name one. */
  default_date_field: string | null;
  fields: ReportField[];
};

export type ReportCatalog = ReportDataset[];

/** Every operator the executor accepts. The union IS the allowlist. */
export type ReportFilterOp =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "before"
  | "after"
  | "between"
  | "is_null"
  | "is_not_null";

export type ReportFilter = {
  field: string;
  op: ReportFilterOp;
  /** Absent for `is_null` / `is_not_null`; an array for `in` and `between`. */
  value?: string | number | (string | number)[] | null;
};

/**
 * Period presets, stored rather than resolved.
 *
 * A saved report that stored two absolute dates would keep reporting last March
 * forever. The preset is resolved against today at run time, and only the
 * resolved `from`/`to` reach the database.
 *
 * `custom` is the escape hatch: it carries explicit dates and does not slide.
 */
export type ReportPreset =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"
  | "custom";

export type ReportPeriod = {
  /** Which date field to filter on. Must be a filterable date/month field. */
  field: string;
  preset: ReportPreset;
  /** `custom` only, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
};

/**
 * How the result is drawn.
 *
 * No `line`: the only charting library installed is `@nivo/bar`, and adding
 * `@nivo/line` is a dependency decision that belongs to a human
 * (`dependency-safety.md`). `funnel` and `ranking` are horizontal bars —
 * genuinely more legible than a tapered funnel for pipeline stages, not a
 * substitute grudgingly accepted.
 */
export type ReportVisualisation =
  | "kpi"
  | "table"
  | "bar"
  | "stacked"
  | "ranking"
  | "funnel"
  | "donut";

export type ReportSpec = {
  dataset: string;
  metrics: string[];
  dimensions: string[];
  filters: ReportFilter[];
  period?: ReportPeriod;
  sort?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  visualisation: ReportVisualisation;
};

/** One grouped row: the dimension values that identify it, and its figures. */
export type ReportRow = {
  dimensions: Record<string, string | null>;
  metrics: Record<string, number | null>;
};

export type ReportResult = {
  rows: ReportRow[];
  row_count: number;
  /** True when the executor had more rows than the limit allowed. */
  truncated: boolean;
};

/** A saved report, as stored. */
export type Report = {
  id: number;
  name: string;
  description: string | null;
  spec: ReportSpec;
  sales_id: number | null;
  visibility: "private" | "shared";
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
};
