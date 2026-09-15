import { describe, expect, it } from "vitest";

import {
  analyticsFiltersToSearch,
  defaultAnalyticsFilters,
  parseAnalyticsFilters,
  presetOf,
  rangeForPreset,
} from "./analyticsFilters";

/**
 * A fixed "today" so no assertion here depends on the day the suite runs.
 * 2026-08-15 sits mid-month, which is what makes the month-boundary rule
 * observable at all.
 */
const TODAY = new Date(2026, 7, 15);

describe("rangeForPreset", () => {
  it("starts every range on a month boundary and ends on one", () => {
    // Arrange / Act
    const range = rangeForPreset("last_6_months", TODAY);

    // Assert — a half month at either end draws a short bar the axis does not
    // explain, which reads as a drop in the business.
    expect(range).toEqual({ from: "2026-03-01", to: "2026-08-31" });
  });

  it("covers three whole months including the current one", () => {
    expect(rangeForPreset("last_3_months", TODAY)).toEqual({
      from: "2026-06-01",
      to: "2026-08-31",
    });
  });

  it("covers twelve whole months including the current one", () => {
    expect(rangeForPreset("last_12_months", TODAY)).toEqual({
      from: "2025-09-01",
      to: "2026-08-31",
    });
  });

  it("starts this_year on the first of January", () => {
    expect(rangeForPreset("this_year", TODAY)).toEqual({
      from: "2026-01-01",
      to: "2026-08-31",
    });
  });

  it("keeps this_month inside a single month", () => {
    expect(rangeForPreset("this_month", TODAY)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });
});

describe("parseAnalyticsFilters", () => {
  it("returns the default six-month window when the URL carries nothing", () => {
    // Act
    const filters = parseAnalyticsFilters(new URLSearchParams(), TODAY);

    // Assert
    expect(filters).toEqual(defaultAnalyticsFilters(TODAY));
    expect(filters.from).toBe("2026-03-01");
  });

  it("reads a valid range and owner out of the query string", () => {
    const filters = parseAnalyticsFilters(
      new URLSearchParams(
        "from=2026-01-01&to=2026-06-30&sales_id=12&team_id=3",
      ),
      TODAY,
    );

    expect(filters).toEqual({
      from: "2026-01-01",
      to: "2026-06-30",
      salesId: 12,
      teamId: 3,
    });
  });

  it("falls back to the default range when the dates are reversed", () => {
    // A reversed range is a typo, not an empty dashboard: every chart would
    // render "no data" and the user would blame the data.
    const filters = parseAnalyticsFilters(
      new URLSearchParams("from=2026-06-30&to=2026-01-01"),
      TODAY,
    );

    expect(filters.from).toBe("2026-03-01");
    expect(filters.to).toBe("2026-08-31");
  });

  it("falls back when a date is shaped right but is not a real day", () => {
    const filters = parseAnalyticsFilters(
      new URLSearchParams("from=2026-02-31&to=2026-06-30"),
      TODAY,
    );

    expect(filters.from).toBe("2026-03-01");
  });

  it("falls back when a date is not a date at all", () => {
    const filters = parseAnalyticsFilters(
      new URLSearchParams("from=yesterday&to=2026-06-30"),
      TODAY,
    );

    expect(filters.from).toBe("2026-03-01");
  });

  it("ignores an owner id that is not a positive integer", () => {
    // These reach an SQL parameter, so they never leave this function unvetted.
    for (const value of ["abc", "-1", "0", "1.5", ""]) {
      const filters = parseAnalyticsFilters(
        new URLSearchParams(`sales_id=${value}`),
        TODAY,
      );
      expect(filters.salesId).toBeNull();
    }
  });
});

describe("analyticsFiltersToSearch", () => {
  it("round-trips a filter set through the URL unchanged", () => {
    // Arrange
    const filters = {
      from: "2026-01-01",
      to: "2026-06-30",
      salesId: 12,
      teamId: null,
    };

    // Act
    const parsed = parseAnalyticsFilters(
      analyticsFiltersToSearch(filters),
      TODAY,
    );

    // Assert
    expect(parsed).toEqual(filters);
  });

  it("writes the default range explicitly so a shared link does not slide", () => {
    // Omitting it would make the same link mean a different six months next
    // month, which is the opposite of what sharing a dashboard is for.
    const search = analyticsFiltersToSearch(defaultAnalyticsFilters(TODAY));

    expect(search.get("from")).toBe("2026-03-01");
    expect(search.get("to")).toBe("2026-08-31");
  });

  it("omits an unset owner rather than writing an empty parameter", () => {
    const search = analyticsFiltersToSearch(defaultAnalyticsFilters(TODAY));

    expect(search.has("sales_id")).toBe(false);
    expect(search.has("team_id")).toBe(false);
  });
});

describe("presetOf", () => {
  it("recognises the range a preset produces", () => {
    expect(presetOf(defaultAnalyticsFilters(TODAY), TODAY)).toBe(
      "last_6_months",
    );
  });

  it("returns null for a hand-picked range", () => {
    expect(
      presetOf(
        { from: "2026-02-03", to: "2026-04-17", salesId: null, teamId: null },
        TODAY,
      ),
    ).toBeNull();
  });
});
