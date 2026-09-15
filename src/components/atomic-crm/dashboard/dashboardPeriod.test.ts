import { describe, expect, test } from "vitest";

import {
  DEFAULT_DASHBOARD_PERIOD,
  greetingFor,
  parseDashboardPeriod,
  rangeForDashboardPeriod,
} from "./dashboardPeriod";

// A Wednesday, mid-quarter, mid-month — so a wrong week or quarter boundary
// cannot coincide with the right one.
const WEDNESDAY = new Date(2026, 4, 13, 10, 0, 0); // 2026-05-13

describe("rangeForDashboardPeriod", () => {
  test("today is a single day", () => {
    expect(rangeForDashboardPeriod("today", WEDNESDAY)).toEqual({
      from: "2026-05-13",
      to: "2026-05-13",
    });
  });

  test("the week starts on Monday, not Sunday", () => {
    // Arrange / Act
    const range = rangeForDashboardPeriod("this_week", WEDNESDAY);

    // Assert: 2026-05-11 is the Monday, 2026-05-17 the Sunday.
    expect(range).toEqual({ from: "2026-05-11", to: "2026-05-17" });
  });

  test("the month runs from the first to the last day", () => {
    expect(rangeForDashboardPeriod("this_month", WEDNESDAY)).toEqual({
      from: "2026-05-01",
      to: "2026-05-31",
    });
  });

  test("the quarter covers its three whole months", () => {
    expect(rangeForDashboardPeriod("this_quarter", WEDNESDAY)).toEqual({
      from: "2026-04-01",
      to: "2026-06-30",
    });
  });

  test("the year covers January to December", () => {
    expect(rangeForDashboardPeriod("this_year", WEDNESDAY)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  test("a range never ends before it starts", () => {
    for (const period of [
      "today",
      "this_week",
      "this_month",
      "this_quarter",
      "this_year",
    ] as const) {
      const { from, to } = rangeForDashboardPeriod(period, WEDNESDAY);
      expect(from <= to).toBe(true);
    }
  });

  test("a day at the end of a month stays inside that month", () => {
    // A boundary date is where an off-by-one shows up: 31 December must not
    // roll "this month" into January.
    const lastDay = new Date(2026, 11, 31, 23, 30, 0);
    expect(rangeForDashboardPeriod("this_month", lastDay)).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });
});

describe("parseDashboardPeriod", () => {
  test("accepts a known period", () => {
    expect(parseDashboardPeriod("this_quarter")).toBe("this_quarter");
  });

  test("falls back to the default for an unknown value", () => {
    // A stale or hand-edited link must render the default dashboard rather
    // than reaching the SQL parameters with an unvalidated string.
    expect(parseDashboardPeriod("last_century")).toBe(DEFAULT_DASHBOARD_PERIOD);
  });

  test("falls back to the default when the parameter is absent", () => {
    expect(parseDashboardPeriod(null)).toBe(DEFAULT_DASHBOARD_PERIOD);
  });
});

describe("greetingFor", () => {
  test.each([
    [6, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [19, "afternoon"],
    [20, "evening"],
    [3, "evening"],
  ])("%i:00 greets with %s", (hour, expected) => {
    expect(greetingFor(new Date(2026, 4, 13, hour, 0, 0))).toBe(expected);
  });
});
