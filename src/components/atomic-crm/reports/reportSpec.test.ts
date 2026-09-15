import { describe, expect, test } from "vitest";

import type { ReportDataset, ReportSpec } from "../types";
import {
  emptySpec,
  operatorsFor,
  parseSpec,
  previousPeriod,
  resolvePeriod,
  specFromParam,
  specToParam,
  specToRpcParams,
  validateAgainstCatalog,
} from "./reportSpec";

/**
 * The spec layer, which is where every calendar and validation decision lives.
 *
 * Dates are injected everywhere, so none of this depends on the day the suite
 * runs — a period test that passes in March and fails in January is worse than
 * no test, because it is discovered by somebody who did not write it.
 *
 * `2026-05-17` is the fixed "today": mid-month and mid-quarter, so a preset
 * that forgot to snap to a boundary produces a visibly wrong answer rather than
 * an accidentally right one.
 */
const TODAY = new Date(2026, 4, 17);

const dataset: ReportDataset = {
  key: "deals",
  label: "Deals",
  default_date_field: "created_at",
  fields: [
    {
      key: "stage",
      label: "Stage",
      role: "dimension",
      data_type: "text",
      aggregate: null,
      filterable: true,
      label_source: "dealStages",
    },
    {
      key: "owner",
      label: "Owner",
      role: "dimension",
      data_type: "text",
      aggregate: null,
      filterable: true,
      label_source: null,
    },
    {
      key: "created_at",
      label: "Created date",
      role: "dimension",
      data_type: "date",
      aggregate: null,
      filterable: true,
      label_source: null,
    },
    {
      key: "amount_sum",
      label: "Total value",
      role: "metric",
      data_type: "money",
      aggregate: "sum",
      filterable: false,
      label_source: null,
    },
    {
      key: "deal_count",
      label: "Number of deals",
      role: "metric",
      data_type: "number",
      aggregate: "count",
      filterable: false,
      label_source: null,
    },
  ],
};

const baseSpec: ReportSpec = {
  dataset: "deals",
  metrics: ["amount_sum"],
  dimensions: ["stage"],
  filters: [],
  visualisation: "bar",
};

describe("resolvePeriod", () => {
  test("snaps a rolling range to whole months at both ends", () => {
    // Arrange / Act
    const range = resolvePeriod(
      { field: "created_at", preset: "last_3_months" },
      TODAY,
    );

    // Assert — March 1st to May 31st, not "three months back from the 17th".
    // A half month at each end draws a short first and last bar for a reason
    // the axis never shows, which reads as a drop in the business.
    expect(range).toEqual({ from: "2026-03-01", to: "2026-05-31" });
  });

  test("last_month is the previous calendar month, not the last 30 days", () => {
    expect(
      resolvePeriod({ field: "created_at", preset: "last_month" }, TODAY),
    ).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  test("this_quarter snaps to the quarter containing today", () => {
    expect(
      resolvePeriod({ field: "created_at", preset: "this_quarter" }, TODAY),
    ).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  test("last_quarter is the whole preceding quarter", () => {
    expect(
      resolvePeriod({ field: "created_at", preset: "last_quarter" }, TODAY),
    ).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });

  test("last_year is the whole preceding calendar year", () => {
    expect(
      resolvePeriod({ field: "created_at", preset: "last_year" }, TODAY),
    ).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });

  test("custom keeps the stored dates instead of sliding", () => {
    expect(
      resolvePeriod(
        {
          field: "created_at",
          preset: "custom",
          from: "2026-01-05",
          to: "2026-02-09",
        },
        TODAY,
      ),
    ).toEqual({ from: "2026-01-05", to: "2026-02-09" });
  });

  test("returns null for a reversed custom range rather than querying it", () => {
    // A reversed range is a typo, not an empty report: every chart would render
    // "no data" and look like a business with nothing in it.
    expect(
      resolvePeriod(
        {
          field: "created_at",
          preset: "custom",
          from: "2026-05-01",
          to: "2026-04-01",
        },
        TODAY,
      ),
    ).toBeNull();
  });

  test("returns null when there is no period at all", () => {
    expect(resolvePeriod(undefined, TODAY)).toBeNull();
  });
});

describe("previousPeriod", () => {
  test("shifts back by the full inclusive length, leaving no overlap", () => {
    // Arrange — a 31-day inclusive range.
    const range = { from: "2026-05-01", to: "2026-05-31" };

    // Act
    const previous = previousPeriod(range);

    // Assert — ends the day BEFORE the current range starts. An off-by-one here
    // would overlap the two periods by a day and double-count whatever landed
    // on it, which is invisible in the chart and wrong in the comparison.
    expect(previous).toEqual({ from: "2026-03-31", to: "2026-04-30" });
  });

  test("handles a single-day range", () => {
    expect(previousPeriod({ from: "2026-05-10", to: "2026-05-10" })).toEqual({
      from: "2026-05-09",
      to: "2026-05-09",
    });
  });
});

describe("operatorsFor", () => {
  test("offers text matching only on text fields", () => {
    expect(operatorsFor("text")).toContain("contains");
    expect(operatorsFor("number")).not.toContain("contains");
    expect(operatorsFor("date")).not.toContain("contains");
  });

  test("offers ordering comparisons on dates and numbers, not on text", () => {
    expect(operatorsFor("date")).toContain("before");
    expect(operatorsFor("number")).toContain("gte");
    expect(operatorsFor("text")).not.toContain("gte");
  });

  test("offers the null tests on every type", () => {
    for (const type of ["text", "number", "money", "date", "month"] as const) {
      expect(operatorsFor(type)).toContain("is_null");
      expect(operatorsFor(type)).toContain("is_not_null");
    }
  });
});

describe("validateAgainstCatalog", () => {
  test("accepts a spec whose every key exists in the dataset", () => {
    expect(validateAgainstCatalog(baseSpec, dataset)).toBeNull();
  });

  test("rejects a metric key that is actually a dimension", () => {
    expect(
      validateAgainstCatalog({ ...baseSpec, metrics: ["stage"] }, dataset),
    ).toBe("unknown_metric");
  });

  test("rejects a dimension key that is actually a metric", () => {
    expect(
      validateAgainstCatalog(
        { ...baseSpec, dimensions: ["amount_sum"] },
        dataset,
      ),
    ).toBe("unknown_dimension");
  });

  test("rejects a filter on a metric", () => {
    // Filtering a metric is a HAVING clause — a different question — and the
    // executor refuses it, so the panel must refuse it first.
    expect(
      validateAgainstCatalog(
        {
          ...baseSpec,
          filters: [{ field: "amount_sum", op: "gt", value: 10 }],
        },
        dataset,
      ),
    ).toBe("unknown_filter_field");
  });

  test("rejects an operator that does not apply to the field's type", () => {
    expect(
      validateAgainstCatalog(
        {
          ...baseSpec,
          filters: [{ field: "created_at", op: "contains", value: "x" }],
        },
        dataset,
      ),
    ).toBe("bad_operator");
  });

  test("rejects a period pointing at a field that is not a date", () => {
    expect(
      validateAgainstCatalog(
        { ...baseSpec, period: { field: "stage", preset: "this_month" } },
        dataset,
      ),
    ).toBe("bad_period_field");
  });

  test("rejects a sort on a field that is not selected", () => {
    expect(
      validateAgainstCatalog(
        { ...baseSpec, sort: { field: "owner", direction: "desc" } },
        dataset,
      ),
    ).toBe("bad_sort");
  });

  test("rejects a chart with nothing to group by", () => {
    expect(
      validateAgainstCatalog({ ...baseSpec, dimensions: [] }, dataset),
    ).toBe("needs_dimension");
  });

  test("allows a KPI with no dimensions, because a KPI is the total", () => {
    expect(
      validateAgainstCatalog(
        { ...baseSpec, dimensions: [], visualisation: "kpi" },
        dataset,
      ),
    ).toBeNull();
  });

  test("rejects a donut carrying more than one metric", () => {
    // A donut is a share of a whole; two metrics have no shared whole to be
    // shares of.
    expect(
      validateAgainstCatalog(
        {
          ...baseSpec,
          metrics: ["amount_sum", "deal_count"],
          visualisation: "donut",
        },
        dataset,
      ),
    ).toBe("needs_single_metric");
  });

  test("rejects stacked bars without exactly two dimensions", () => {
    expect(
      validateAgainstCatalog(
        { ...baseSpec, visualisation: "stacked" },
        dataset,
      ),
    ).toBe("needs_two_dimensions");
  });

  test("rejects a spec for a dataset the catalog does not publish", () => {
    expect(validateAgainstCatalog(baseSpec, undefined)).toBe("unknown_dataset");
  });
});

describe("the URL round trip", () => {
  test("a spec survives being packed and unpacked", () => {
    // Arrange — the awkward shapes: a nested filter, an array value, a period.
    const spec: ReportSpec = {
      ...baseSpec,
      filters: [{ field: "stage", op: "in", value: ["won", "lost"] }],
      period: { field: "created_at", preset: "last_6_months" },
      sort: { field: "amount_sum", direction: "desc" },
    };

    // Act
    const restored = specFromParam(specToParam(spec));

    // Assert
    expect(restored).toEqual(spec);
  });

  test("a corrupted parameter yields null instead of throwing", () => {
    // A hand-edited link must land the user in the builder, not on a stack
    // trace.
    expect(specFromParam("not-base64-at-all!!")).toBeNull();
    expect(specFromParam(null)).toBeNull();
  });

  test("a stored spec that omits dimensions and filters still parses", () => {
    // Arrange — this is verbatim the shape of the seeded built-in reports, and
    // it is the bug that shipped: requiring `filters` made fifteen of the
    // seventeen library reports fail to parse, so opening one said "this report
    // does not exist" about a report visible in the list.
    const stored = {
      dataset: "deals",
      metrics: ["won_amount", "lost_amount"],
      period: { field: "expected_closing_date", preset: "last_12_months" },
      sort: { field: "won_amount", direction: "desc" },
      visualisation: "bar",
    };

    // Act
    const parsed = parseSpec(stored);

    // Assert — parsed, and the two missing keys are present as empty rather
    // than undefined, so every downstream reader can treat them as arrays.
    expect(parsed).not.toBeNull();
    expect(parsed?.dimensions).toEqual([]);
    expect(parsed?.filters).toEqual([]);
  });

  test("a spec with only the two required keys parses", () => {
    // The executor's true minimum: a dataset and one metric.
    expect(
      parseSpec({
        dataset: "tasks",
        metrics: ["task_count"],
        visualisation: "kpi",
      }),
    ).not.toBeNull();
  });

  test("a well-formed but invalid spec is rejected by the schema", () => {
    // No metrics: the executor refuses it, so parsing must too.
    expect(parseSpec({ ...baseSpec, metrics: [] })).toBeNull();
    // Three dimensions: over the executor's cap.
    expect(parseSpec({ ...baseSpec, dimensions: ["a", "b", "c"] })).toBeNull();
    // A visualisation that does not exist.
    expect(parseSpec({ ...baseSpec, visualisation: "sankey" })).toBeNull();
  });
});

describe("specToRpcParams", () => {
  test("resolves the preset to two dates, so the database sees no preset", () => {
    // Act
    const params = specToRpcParams(
      { ...baseSpec, period: { field: "created_at", preset: "this_month" } },
      TODAY,
    );

    // Assert
    expect(params).toEqual({
      p_spec: {
        dataset: "deals",
        metrics: ["amount_sum"],
        dimensions: ["stage"],
        filters: [],
        period: { field: "created_at", from: "2026-05-01", to: "2026-05-31" },
      },
    });
  });

  test("omits the period entirely when the spec carries none", () => {
    // "Who is carrying overdue work" has no month, and sending an empty period
    // object would make the executor filter on a null range.
    const params = specToRpcParams(baseSpec, TODAY) as {
      p_spec: Record<string, unknown>;
    };
    expect(params.p_spec).not.toHaveProperty("period");
  });

  test("an override range wins over the preset, for period comparison", () => {
    const params = specToRpcParams(
      { ...baseSpec, period: { field: "created_at", preset: "this_month" } },
      TODAY,
      { from: "2026-01-01", to: "2026-01-31" },
    ) as { p_spec: { period: unknown } };

    expect(params.p_spec.period).toEqual({
      field: "created_at",
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });
});

describe("emptySpec", () => {
  test("opens on the simplest true report rather than on an error", () => {
    // Act
    const spec = emptySpec(dataset);

    // Assert — the executor refuses a report with no metric, so an empty
    // builder would open on a red message. It opens on "how many are there".
    expect(spec.metrics).toEqual(["amount_sum"]);
    expect(spec.dimensions).toEqual([]);
    expect(spec.visualisation).toBe("kpi");
    expect(validateAgainstCatalog(spec, dataset)).toBeNull();
  });

  test("carries the dataset's own default date field", () => {
    expect(emptySpec(dataset).period?.field).toBe("created_at");
  });
});
