import { describe, expect, test } from "vitest";

import type { TeamDealStat } from "../types";
import {
  cumulativeAgainstTarget,
  dealFunnel,
  formatMonthLabel,
  monthlySeries,
  pipelineByStage,
  stageBreakdown,
} from "./teamStats";

const STAGE_ORDER = [
  "opportunity",
  "proposal-sent",
  "in-negociation",
  "won",
  "lost",
  "delayed",
];

const WON_STAGES = ["won"];

const stat = (overrides: Partial<TeamDealStat>): TeamDealStat => ({
  id: "1-1-2026-01-opportunity",
  team_id: 1,
  sales_id: 1,
  month: "2026-01-01",
  stage: "opportunity",
  nb_deals: 1,
  amount: 1000,
  ...overrides,
});

describe("monthlySeries", () => {
  test("splits each month between won and still-open amounts", () => {
    // Arrange
    const stats = [
      stat({ id: "a", month: "2026-01-01", stage: "won", amount: 5000 }),
      stat({
        id: "b",
        month: "2026-01-01",
        stage: "opportunity",
        amount: 3000,
      }),
      stat({ id: "c", month: "2026-02-01", stage: "won", amount: 1000 }),
    ];

    // Act
    const series = monthlySeries(stats, WON_STAGES);

    // Assert
    expect(series).toEqual([
      { month: "2026-01-01", won: 5000, pipeline: 3000, lost: 0, nbDeals: 2 },
      { month: "2026-02-01", won: 1000, pipeline: 0, lost: 0, nbDeals: 1 },
    ]);
  });

  test("orders the months oldest first whatever order the rows arrive in", () => {
    const stats = [
      stat({ id: "a", month: "2026-11-01" }),
      stat({ id: "b", month: "2026-02-01" }),
    ];

    expect(monthlySeries(stats, WON_STAGES).map((p) => p.month)).toEqual([
      "2026-02-01",
      "2026-11-01",
    ]);
  });

  test("keeps a lost deal out of both the won bar and the pipeline bar", () => {
    // This test used to assert the opposite -- that a lost deal counted as
    // pipeline -- which is the defect: `stage <> 'won'` booked dead money as
    // forecast here and in `teams_summary`, while the CRM dashboard has always
    // excluded it. Losing is a terminal state, not a stage of the funnel, and
    // it now gets its own series so it is reported instead of hidden.
    const series = monthlySeries(
      [stat({ stage: "lost", amount: 9000 })],
      WON_STAGES,
    );

    expect(series[0].won).toBe(0);
    expect(series[0].pipeline).toBe(0);
    expect(series[0].lost).toBe(9000);
  });

  test("still counts a non-terminal stage as pipeline", () => {
    // The fix must not swallow `delayed`, which is stalled but not dead.
    const series = monthlySeries(
      [stat({ stage: "delayed", amount: 4000 })],
      WON_STAGES,
    );

    expect(series[0].pipeline).toBe(4000);
    expect(series[0].lost).toBe(0);
  });

  test("leaves months with no deals out instead of plotting them at zero", () => {
    // A flat line through months nobody has closed yet reads as a run of
    // failures rather than as a period still in progress.
    const series = monthlySeries(
      [stat({ month: "2026-01-01" }), stat({ id: "b", month: "2026-06-01" })],
      WON_STAGES,
    );

    expect(series).toHaveLength(2);
  });

  test("returns an empty series for a missing list", () => {
    expect(monthlySeries(undefined, WON_STAGES)).toEqual([]);
  });
});

describe("stageBreakdown", () => {
  test("adds up every month of a stage into one bar", () => {
    // Arrange
    const stats = [
      stat({
        id: "a",
        month: "2026-01-01",
        stage: "proposal-sent",
        amount: 100,
      }),
      stat({
        id: "b",
        month: "2026-02-01",
        stage: "proposal-sent",
        amount: 400,
      }),
    ];

    // Act
    const breakdown = stageBreakdown(stats);

    // Assert
    expect(breakdown).toEqual([
      { stage: "proposal-sent", amount: 500, nbDeals: 2 },
    ]);
  });

  test("puts the biggest stage first", () => {
    const stats = [
      stat({ id: "a", stage: "opportunity", amount: 100 }),
      stat({ id: "b", stage: "won", amount: 900 }),
    ];

    expect(stageBreakdown(stats).map((point) => point.stage)).toEqual([
      "won",
      "opportunity",
    ]);
  });
});

describe("pipelineByStage", () => {
  test("drops the terminal stages so it matches the pipeline figure above it", () => {
    // Arrange: a period late enough that `won` is the biggest bar of all.
    const stats = [
      stat({ id: "a", stage: "won", amount: 9000 }),
      stat({ id: "b", stage: "lost", amount: 4000 }),
      stat({ id: "c", stage: "opportunity", amount: 1000 }),
      stat({ id: "d", stage: "delayed", amount: 500 }),
    ];

    // Act
    const points = pipelineByStage(stats, WON_STAGES);

    // Assert: still-in-play only, and `delayed` survives.
    expect(points.map((point) => point.stage)).toEqual([
      "opportunity",
      "delayed",
    ]);
    expect(points.reduce((total, point) => total + point.amount, 0)).toBe(1500);
  });

  test("returns nothing when every deal has already been decided", () => {
    const points = pipelineByStage(
      [stat({ stage: "won" }), stat({ id: "b", stage: "lost" })],
      WON_STAGES,
    );

    expect(points).toEqual([]);
  });
});

describe("cumulativeAgainstTarget", () => {
  test("accumulates won month by month against a flat target", () => {
    // Arrange
    const points = monthlySeries(
      [
        stat({ id: "a", month: "2026-01-01", stage: "won", amount: 100 }),
        stat({ id: "b", month: "2026-02-01", stage: "won", amount: 250 }),
        stat({
          id: "c",
          month: "2026-03-01",
          stage: "opportunity",
          amount: 900,
        }),
      ],
      WON_STAGES,
    );

    // Act
    const series = cumulativeAgainstTarget(points, 1000);

    // Assert: the open deal in March moves nothing, and the line never dips.
    expect(series.map((point) => point.wonToDate)).toEqual([100, 350, 350]);
    expect(series.every((point) => point.target === 1000)).toBe(true);
  });

  test("drops the reference line for a team with no target", () => {
    // A target drawn at zero would read as a target that was met.
    const series = cumulativeAgainstTarget(
      monthlySeries([stat({ stage: "won", amount: 100 })], WON_STAGES),
      null,
    );

    expect(series[0].target).toBeNull();
  });

  test("returns an empty series when there are no months to accumulate", () => {
    expect(cumulativeAgainstTarget([], 1000)).toEqual([]);
  });
});

describe("dealFunnel", () => {
  test("lays the stages out in configured order, not by size", () => {
    // Arrange: the biggest stage is deliberately late in the order.
    const stats = [
      stat({ id: "a", stage: "in-negociation", amount: 9000, nb_deals: 9 }),
      stat({ id: "b", stage: "opportunity", amount: 100, nb_deals: 1 }),
    ];

    // Act
    const points = dealFunnel(stats, STAGE_ORDER);

    // Assert
    expect(points.map((point) => point.stage)).toEqual([
      "opportunity",
      "in-negociation",
    ]);
  });

  test("reports each stage's share of the period's deals", () => {
    const points = dealFunnel(
      [
        stat({ id: "a", stage: "opportunity", nb_deals: 3 }),
        stat({ id: "b", stage: "won", nb_deals: 1 }),
      ],
      STAGE_ORDER,
    );

    expect(points.map((point) => point.share)).toEqual([0.75, 0.25]);
  });

  test("omits a configured stage that no deal is sitting in", () => {
    // An empty step drawn at zero implies deals fell out of it, which is a
    // claim this data cannot support.
    const points = dealFunnel(
      [stat({ stage: "won", nb_deals: 2 })],
      STAGE_ORDER,
    );

    expect(points.map((point) => point.stage)).toEqual(["won"]);
  });

  test("returns an empty funnel rather than dividing by zero", () => {
    expect(dealFunnel([], STAGE_ORDER)).toEqual([]);
    expect(dealFunnel(undefined, STAGE_ORDER)).toEqual([]);
  });
});

describe("formatMonthLabel", () => {
  test("renders the month the date actually names", () => {
    // `new Date("2026-03-01")` is UTC midnight, which is February 28th in every
    // timezone west of Greenwich — an axis off by a month for half the world.
    expect(formatMonthLabel("2026-03-01")).toBe("Mar 2026");
  });
});
