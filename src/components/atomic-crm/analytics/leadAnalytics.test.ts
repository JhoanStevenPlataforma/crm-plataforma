import { describe, expect, it } from "vitest";

import type { LeadBreakdownStat, LeadFlowStat } from "../types";
import {
  attributableShare,
  averageConversionDays,
  bucketsOf,
  conversionRate,
  leadTotals,
  revenueBySource,
} from "./leadAnalytics";

const flowRow = (over: Partial<LeadFlowStat>): LeadFlowStat => ({
  month: "2026-01-01",
  nb_created: 0,
  nb_converted: 0,
  avg_conversion_days: null,
  ...over,
});

const bucketRow = (over: Partial<LeadBreakdownStat>): LeadBreakdownStat => ({
  dimension: "source",
  bucket: "web",
  nb_leads: 0,
  nb_converted: 0,
  nb_won_deals: 0,
  won_amount: 0,
  pipeline_amount: 0,
  avg_conversion_days: null,
  ...over,
});

describe("conversionRate", () => {
  it("divides converted by created", () => {
    expect(conversionRate(40, 10)).toBe(0.25);
  });

  it("is null when no lead arrived, rather than zero", () => {
    // A rate with no denominator is not 0% — it is unanswerable, and 0% would
    // read as "this channel converts nobody".
    expect(conversionRate(0, 0)).toBeNull();
  });
});

describe("averageConversionDays", () => {
  it("recovers the true mean instead of averaging monthly averages", () => {
    // Arrange — one lead converting in 2 days, then ninety-nine in 100 days.
    // Averaging the two monthly means gives 51; the honest answer is ~99.
    const totals = leadTotals([
      flowRow({ month: "2026-01-01", nb_converted: 1, avg_conversion_days: 2 }),
      flowRow({
        month: "2026-02-01",
        nb_converted: 99,
        avg_conversion_days: 100,
      }),
    ]);

    // Act
    const days = averageConversionDays(totals);

    // Assert
    expect(days).toBeCloseTo(9902 / 100, 6);
    expect(days).not.toBeCloseTo(51, 0);
  });

  it("is null when nothing converted", () => {
    expect(
      averageConversionDays(leadTotals([flowRow({ nb_created: 5 })])),
    ).toBeNull();
  });
});

describe("leadTotals", () => {
  it("sums the cohort across months", () => {
    const totals = leadTotals([
      flowRow({ month: "2026-01-01", nb_created: 10, nb_converted: 3 }),
      flowRow({ month: "2026-02-01", nb_created: 5, nb_converted: 1 }),
    ]);

    expect(totals.nbCreated).toBe(15);
    expect(totals.nbConverted).toBe(4);
  });
});

describe("bucketsOf", () => {
  it("returns only the dimension asked for", () => {
    const stats = [
      bucketRow({ dimension: "source", bucket: "web", nb_leads: 5 }),
      bucketRow({ dimension: "status", bucket: "new", nb_leads: 9 }),
    ];

    expect(bucketsOf(stats, "source").map((point) => point.bucket)).toEqual([
      "web",
    ]);
  });

  it("ranks buckets by volume and carries each one's own rate", () => {
    const points = bucketsOf(
      [
        bucketRow({ bucket: "referral", nb_leads: 4, nb_converted: 2 }),
        bucketRow({ bucket: "web", nb_leads: 10, nb_converted: 1 }),
      ],
      "source",
    );

    expect(points.map((point) => point.bucket)).toEqual(["web", "referral"]);
    // The rate is per bucket, not the cohort's — that is the whole point of
    // the chart: the biggest channel is often the worst-converting one.
    expect(points[0].conversionRate).toBeCloseTo(0.1, 6);
    expect(points[1].conversionRate).toBeCloseTo(0.5, 6);
  });
});

describe("revenueBySource", () => {
  it("ranks by money, not by volume", () => {
    // The channel that brings the most leads is frequently not the one that
    // brings the most revenue, and that gap is why this chart sits next to the
    // volume one instead of replacing it.
    const points = revenueBySource([
      bucketRow({ bucket: "web", nb_leads: 100, won_amount: 1000 }),
      bucketRow({ bucket: "partner", nb_leads: 3, won_amount: 90000 }),
    ]);

    expect(points.map((point) => point.bucket)).toEqual(["partner", "web"]);
  });
});

describe("attributableShare", () => {
  it("reports what fraction of converted leads produced a priceable deal", () => {
    // `deals` has no source column, so a deal typed into the kanban is
    // unattributable. Without this share the revenue chart reads as the whole
    // business rather than the sliver of it that carries an origin.
    const share = attributableShare([
      bucketRow({ bucket: "web", nb_converted: 8, nb_won_deals: 2 }),
      bucketRow({ bucket: "partner", nb_converted: 2, nb_won_deals: 0 }),
    ]);

    expect(share).toBeCloseTo(0.2, 6);
  });

  it("is null when nothing converted at all", () => {
    expect(attributableShare([bucketRow({ nb_leads: 5 })])).toBeNull();
  });

  it("ignores the status and owner rows so the cohort is not counted twice", () => {
    // All three dimensions cover the same leads; summing across them would
    // treble the denominator.
    const share = attributableShare([
      bucketRow({ dimension: "source", nb_converted: 4, nb_won_deals: 2 }),
      bucketRow({ dimension: "status", nb_converted: 4, nb_won_deals: 2 }),
      bucketRow({ dimension: "owner", nb_converted: 4, nb_won_deals: 2 }),
    ]);

    expect(share).toBeCloseTo(0.5, 6);
  });
});
