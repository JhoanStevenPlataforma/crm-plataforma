import { describe, expect, it } from "vitest";

import type { DealFlowStat, DealOwnerStat, DealStageStat } from "../types";
import {
  averageDealSize,
  weightedPipeline,
  forecastCycleDays,
  ownerSeries,
  periodTotals,
  pipelineTotal,
  stageSeries,
} from "./dealAnalytics";

const STAGE_ORDER = [
  "opportunity",
  "proposal-sent",
  "in-negociation",
  "delayed",
];

const flowRow = (over: Partial<DealFlowStat>): DealFlowStat => ({
  month: "2026-01-01",
  nb_created: 0,
  amount_created: 0,
  nb_won: 0,
  amount_won: 0,
  nb_lost: 0,
  amount_lost: 0,
  nb_forecast: 0,
  forecast_days_total: 0,
  ...over,
});

describe("stageSeries", () => {
  it("lays stages out in configured order, not in the order the rows arrived", () => {
    // Arrange — the database groups by stage and returns them in any order.
    const stats: DealStageStat[] = [
      { stage: "in-negociation", nb_deals: 2, amount: 200 },
      { stage: "opportunity", nb_deals: 5, amount: 500 },
    ];

    // Act
    const points = stageSeries(stats, STAGE_ORDER);

    // Assert — here the order IS the meaning; sorted by size it is just a bar
    // chart and stops reading as a pipeline.
    expect(points.map((point) => point.stage)).toEqual([
      "opportunity",
      "in-negociation",
    ]);
  });

  it("drops a configured stage that holds no live deal", () => {
    // An empty bar in the middle of a funnel reads as a stage deals skip.
    const points = stageSeries(
      [{ stage: "opportunity", nb_deals: 1, amount: 100 }],
      STAGE_ORDER,
    );

    expect(points).toHaveLength(1);
  });

  it("returns nothing when the query has not resolved yet", () => {
    expect(stageSeries(undefined, STAGE_ORDER)).toEqual([]);
  });
});

describe("pipelineTotal", () => {
  it("sums every open stage into the headline figure", () => {
    const total = pipelineTotal([
      { stage: "opportunity", nb_deals: 5, amount: 500 },
      { stage: "in-negociation", nb_deals: 2, amount: 200 },
    ]);

    expect(total).toEqual({ nbDeals: 7, amount: 700 });
  });
});

describe("periodTotals", () => {
  it("adds the monthly rows into the period's tiles", () => {
    const totals = periodTotals([
      flowRow({ month: "2026-01-01", nb_created: 3, amount_created: 300 }),
      flowRow({ month: "2026-02-01", nb_won: 2, amount_won: 900, nb_lost: 1 }),
    ]);

    expect(totals.nbCreated).toBe(3);
    expect(totals.wonAmount).toBe(900);
    expect(totals.nbLost).toBe(1);
  });
});

describe("averageDealSize", () => {
  it("divides won amount by won count", () => {
    const totals = periodTotals([flowRow({ nb_won: 4, amount_won: 1000 })]);

    expect(averageDealSize(totals)).toBe(250);
  });

  it("is null rather than zero when nothing closed", () => {
    // "We sold nothing" and "the average of nothing" are different statements
    // and only one of them is true.
    expect(averageDealSize(periodTotals([]))).toBeNull();
  });
});

describe("forecastCycleDays", () => {
  it("divides the summed days by the summed count, not the monthly averages", () => {
    // Arrange — one deal at 10 days, then ninety deals at 100 days. Averaging
    // the two monthly means gives 55; the honest answer is ~99.
    const totals = periodTotals([
      flowRow({ month: "2026-01-01", nb_forecast: 1, forecast_days_total: 10 }),
      flowRow({
        month: "2026-02-01",
        nb_forecast: 90,
        forecast_days_total: 9000,
      }),
    ]);

    // Act
    const days = forecastCycleDays(totals);

    // Assert
    expect(days).toBeCloseTo(9010 / 91, 6);
    expect(days).not.toBeCloseTo(55, 0);
  });

  it("is null when no deal carries an expected closing date", () => {
    expect(
      forecastCycleDays(periodTotals([flowRow({ nb_created: 3 })])),
    ).toBeNull();
  });
});

describe("ownerSeries", () => {
  const owner = (over: Partial<DealOwnerStat>): DealOwnerStat => ({
    sales_id: 1,
    owner_name: "Someone",
    nb_open: 0,
    pipeline_amount: 0,
    nb_won: 0,
    won_amount: 0,
    nb_lost: 0,
    lost_amount: 0,
    ...over,
  });

  it("ranks owners by what they are carrying plus what they closed", () => {
    const { points } = ownerSeries([
      owner({ sales_id: 1, owner_name: "Small", won_amount: 100 }),
      owner({ sales_id: 2, owner_name: "Big", won_amount: 900 }),
    ]);

    expect(points.map((point) => point.name)).toEqual(["Big", "Small"]);
  });

  it("reports how many owners it dropped instead of silently truncating", () => {
    // A ranking cut without saying so is read as the whole team.
    const stats = Array.from({ length: 12 }, (_, index) =>
      owner({ sales_id: index, won_amount: index }),
    );

    const { points, hidden } = ownerSeries(stats, 10);

    expect(points).toHaveLength(10);
    expect(hidden).toBe(2);
  });

  it("falls back to the id when a sale has no resolved name", () => {
    const { points } = ownerSeries([owner({ sales_id: 7, owner_name: null })]);

    expect(points[0].name).toBe("7");
  });
});

describe("weightedPipeline", () => {
  const STAGES = [
    { value: "opportunity", label: "Opportunity", probability: 0.2 },
    { value: "in-negociation", label: "In Negotiation", probability: 0.8 },
    // Deliberately unweighted: a stage somebody added to the configuration and
    // never gave a probability.
    { value: "delayed", label: "Delayed" },
  ];

  it("weights each stage by its configured probability", () => {
    // Arrange
    const stats: DealStageStat[] = [
      { stage: "opportunity", nb_deals: 1, amount: 1000 },
      { stage: "in-negociation", nb_deals: 1, amount: 1000 },
    ];

    // Act
    const weighted = weightedPipeline(stats, STAGES);

    // Assert
    expect(weighted.amount).toBe(1000 * 0.2 + 1000 * 0.8);
    expect(weighted.unweightedAmount).toBe(0);
  });

  it("excludes a stage with no probability and reports what it left out", () => {
    // Counting it at zero would silently shrink the forecast the first time
    // somebody adds a stage and forgets its weighting; the tile shows the
    // excluded money instead.
    const weighted = weightedPipeline(
      [
        { stage: "opportunity", nb_deals: 1, amount: 1000 },
        { stage: "delayed", nb_deals: 1, amount: 5000 },
      ],
      STAGES,
    );

    expect(weighted.amount).toBe(200);
    expect(weighted.unweightedAmount).toBe(5000);
  });

  it("is zero, not NaN, before the query resolves", () => {
    expect(weightedPipeline(undefined, STAGES)).toEqual({
      amount: 0,
      unweightedAmount: 0,
    });
  });
});
