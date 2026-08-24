import { describe, expect, test } from "vitest";

import type { Team } from "../types";
import {
  allocationOf,
  attainmentRatio,
  currentYearPeriod,
  formatAttainment,
  sumTeamTotals,
} from "./teamBudget";

const team = (overrides: Partial<Team>): Team => ({
  id: 1,
  name: "Renewals",
  ...overrides,
});

describe("attainmentRatio", () => {
  test("returns the share of the budget already won", () => {
    // Arrange / Act
    const ratio = attainmentRatio(250_000, 1_000_000);

    // Assert
    expect(ratio).toBe(0.25);
  });

  test("returns null when the team has no budget for the period", () => {
    expect(attainmentRatio(250_000, null)).toBeNull();
    expect(attainmentRatio(250_000, undefined)).toBeNull();
  });

  test("returns null rather than Infinity when the budget is zero", () => {
    // A budget of zero is not a team that attained infinitely much; the
    // question simply does not apply.
    expect(attainmentRatio(250_000, 0)).toBeNull();
  });

  test("treats a missing won amount as nothing won, not as no budget", () => {
    expect(attainmentRatio(null, 1_000_000)).toBe(0);
  });

  test("can exceed 1 when the team beat its budget", () => {
    expect(attainmentRatio(1_500_000, 1_000_000)).toBe(1.5);
  });
});

describe("formatAttainment", () => {
  test("renders a ratio as a rounded percentage", () => {
    expect(formatAttainment(0.256)).toBe("26%");
  });

  test("renders an inapplicable attainment as a dash, not as 0%", () => {
    // "0%" would claim the team sold nothing; the truth is there is no target.
    expect(formatAttainment(null)).toBe("—");
  });
});

describe("sumTeamTotals", () => {
  test("adds up budget, allocated, pipeline, won and deal count across teams", () => {
    // Arrange
    const teams = [
      team({
        id: 1,
        budget_amount: 1_000_000,
        allocated_amount: 800_000,
        pipeline_amount: 400_000,
        won_amount: 300_000,
        nb_deals: 12,
      }),
      team({
        id: 2,
        budget_amount: 500_000,
        allocated_amount: 500_000,
        pipeline_amount: 100_000,
        won_amount: 200_000,
        nb_deals: 5,
      }),
    ];

    // Act
    const totals = sumTeamTotals(teams);

    // Assert
    expect(totals).toEqual({
      budget: 1_500_000,
      allocated: 1_300_000,
      pipeline: 500_000,
      won: 500_000,
      lost: 0,
      deals: 17,
      nbWon: 0,
      nbLost: 0,
      attainment: 1 / 3,
    });
  });

  test("ignores teams with no budget when totalling, but keeps their deals", () => {
    // Arrange: a team that exists and sells, but has no target for the period.
    const teams = [
      team({
        id: 1,
        budget_amount: 1_000_000,
        won_amount: 500_000,
        nb_deals: 4,
      }),
      team({ id: 2, won_amount: 90_000, nb_deals: 3 }),
    ];

    // Act
    const totals = sumTeamTotals(teams);

    // Assert
    expect(totals.budget).toBe(1_000_000);
    expect(totals.won).toBe(590_000);
    expect(totals.deals).toBe(7);
    expect(totals.attainment).toBe(0.59);
  });

  test("reports no attainment when not one team has a budget", () => {
    const totals = sumTeamTotals([team({ id: 1, won_amount: 10 })]);

    expect(totals.attainment).toBeNull();
  });

  test("returns zeroed totals for an empty or missing list", () => {
    expect(sumTeamTotals([])).toEqual({
      budget: 0,
      allocated: 0,
      pipeline: 0,
      won: 0,
      lost: 0,
      deals: 0,
      nbWon: 0,
      nbLost: 0,
      attainment: null,
    });
    expect(sumTeamTotals(undefined)).toEqual({
      budget: 0,
      allocated: 0,
      pipeline: 0,
      won: 0,
      lost: 0,
      deals: 0,
      nbWon: 0,
      nbLost: 0,
      attainment: null,
    });
  });
});

describe("allocationOf", () => {
  test("reports what is left to hand out", () => {
    // Arrange / Act
    const allocation = allocationOf(1_000_000, 750_000);

    // Assert
    expect(allocation.allocated).toBe(750_000);
    expect(allocation.remaining).toBe(250_000);
    expect(allocation.coverage).toBe(0.75);
    expect(allocation.isOverAllocated).toBe(false);
  });

  test("reports a negative remainder when the members were promised more than the team", () => {
    // The database accepts this — reallocating between two people is two
    // writes, and rejecting the first would make the edit impossible — so
    // naming it is this layer's job.
    const allocation = allocationOf(1_000_000, 1_200_000);

    expect(allocation.remaining).toBe(-200_000);
    expect(allocation.isOverAllocated).toBe(true);
  });

  test("does not call a team with no budget over- or under-allocated", () => {
    // There is nothing to be a share OF, so the answer is "not applicable",
    // not "0 left" — which would read as a fully allocated team.
    const allocation = allocationOf(null, 50_000);

    expect(allocation.allocated).toBe(50_000);
    expect(allocation.remaining).toBeNull();
    expect(allocation.coverage).toBeNull();
    expect(allocation.isOverAllocated).toBe(false);
  });

  test("treats a budget of zero the same way, rather than dividing by it", () => {
    expect(allocationOf(0, 10).coverage).toBeNull();
  });

  test("counts nothing allocated as zero, not as unknown", () => {
    const allocation = allocationOf(1_000_000, undefined);

    expect(allocation.allocated).toBe(0);
    expect(allocation.remaining).toBe(1_000_000);
    expect(allocation.coverage).toBe(0);
  });
});

describe("currentYearPeriod", () => {
  test("spans the calendar year containing the given date", () => {
    const period = currentYearPeriod(new Date("2026-08-18T12:00:00Z"));

    expect(period).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
});
