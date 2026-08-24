import { describe, expect, test } from "vitest";

import {
  formatCoverage,
  formatGap,
  paceOf,
  periodProgress,
  pipelineCoverage,
  winRate,
} from "./teamPace";

/**
 * Pace is the part of the dashboard that turns a number into a judgement, so
 * these tests are mostly about the judgements it must REFUSE to make: no
 * budget, no period, a target already met, nothing closed yet.
 */

const PERIOD = { start: "2026-01-01", end: "2026-12-31" };

describe("periodProgress", () => {
  test("reports the share of the period already elapsed", () => {
    // Arrange: 2026-07-02 is the 183rd of 365 days.
    const today = new Date(2026, 6, 2);

    // Act
    const elapsed = periodProgress(PERIOD.start, PERIOD.end, today);

    // Assert
    expect(elapsed).toBeCloseTo(0.5, 2);
  });

  test("returns null when the team has no period to measure against", () => {
    expect(periodProgress(null, null, new Date(2026, 6, 2))).toBeNull();
    expect(periodProgress("2026-01-01", null, new Date(2026, 6, 2))).toBeNull();
  });

  test("clamps to zero for a period that has not started yet", () => {
    const elapsed = periodProgress(
      PERIOD.start,
      PERIOD.end,
      new Date(2025, 5, 1),
    );

    expect(elapsed).toBe(0);
  });

  test("clamps to one for a period that is already over", () => {
    const elapsed = periodProgress(
      PERIOD.start,
      PERIOD.end,
      new Date(2027, 5, 1),
    );

    expect(elapsed).toBe(1);
  });

  test("returns null rather than a negative span when the dates are inverted", () => {
    const elapsed = periodProgress(
      "2026-12-31",
      "2026-01-01",
      new Date(2026, 6, 2),
    );

    expect(elapsed).toBeNull();
  });
});

describe("paceOf", () => {
  const team = (won: number, budget: number | null) => ({
    won_amount: won,
    budget_amount: budget,
    budget_period_start: PERIOD.start,
    budget_period_end: PERIOD.end,
  });

  test("calls a team behind when attainment lags the calendar", () => {
    // Arrange: half the year gone, a quarter of the target won.
    const today = new Date(2026, 6, 2);

    // Act
    const pace = paceOf(team(250_000, 1_000_000), today);

    // Assert
    expect(pace.status).toBe("behind");
    expect(pace.gap).toBeCloseTo(-0.25, 2);
  });

  test("calls a team ahead when attainment outruns the calendar", () => {
    const pace = paceOf(team(800_000, 1_000_000), new Date(2026, 6, 2));

    expect(pace.status).toBe("ahead");
  });

  test("treats a small gap as on track rather than flagging it", () => {
    // Arrange: 5 points behind the calendar, inside the tolerance. Attainment
    // moves one deal at a time, so a threshold at parity would flag half the
    // teams on any given morning.
    const pace = paceOf(team(450_000, 1_000_000), new Date(2026, 6, 2));

    expect(pace.status).toBe("on_track");
  });

  test("reports unknown, not behind, for a team with no target", () => {
    // A team nobody set a budget for is a different problem, and not this
    // team's fault: it must not be rendered as failing.
    const pace = paceOf(team(250_000, null), new Date(2026, 6, 2));

    expect(pace.status).toBe("unknown");
    expect(pace.gap).toBeNull();
  });

  test("reports unknown when there is a budget but no period", () => {
    const pace = paceOf(
      {
        won_amount: 250_000,
        budget_amount: 1_000_000,
        budget_period_start: null,
        budget_period_end: null,
      },
      new Date(2026, 6, 2),
    );

    expect(pace.status).toBe("unknown");
  });
});

describe("pipelineCoverage", () => {
  test("measures the pipeline against what is still missing", () => {
    // Arrange / Act: 600k of pipeline against a 300k gap.
    const coverage = pipelineCoverage({
      pipeline_amount: 600_000,
      won_amount: 700_000,
      budget_amount: 1_000_000,
    });

    // Assert
    expect(coverage).toBe(2);
  });

  test("returns null once the target is met, rather than infinity", () => {
    const coverage = pipelineCoverage({
      pipeline_amount: 600_000,
      won_amount: 1_000_000,
      budget_amount: 1_000_000,
    });

    expect(coverage).toBeNull();
  });

  test("returns null when there is no target to cover", () => {
    expect(
      pipelineCoverage({
        pipeline_amount: 600_000,
        won_amount: 0,
        budget_amount: null,
      }),
    ).toBeNull();
  });
});

describe("winRate", () => {
  test("counts only the deals that reached a decision", () => {
    expect(winRate(3, 1)).toBe(0.75);
  });

  test("returns null when nothing has closed either way", () => {
    // Zero would read as "we lose everything", which is a different statement.
    expect(winRate(0, 0)).toBeNull();
    expect(winRate(undefined, undefined)).toBeNull();
  });

  test("reports a clean sweep as 100%, not as missing data", () => {
    expect(winRate(4, 0)).toBe(1);
  });
});

describe("formatting", () => {
  test("renders coverage as a multiple and a missing one as an em dash", () => {
    expect(formatCoverage(2.35)).toBe("2.4x");
    expect(formatCoverage(null)).toBe("—");
  });

  test("keeps the sign on the gap, because the direction is the message", () => {
    expect(formatGap(0.12)).toBe("+12 pts");
    expect(formatGap(-0.12)).toBe("-12 pts");
    expect(formatGap(null)).toBe("—");
  });
});
