import { describe, expect, test } from "vitest";

import type { TeamTaskStat } from "../types";
import { formatCycleTime, taskFlowByMonth, taskFlowTotals } from "./taskStats";

/**
 * The cube arrives one row per member per month, so every test here is really
 * about what happens when two members' months are folded into one: the counts
 * add, but the cycle times must NOT, and averaging two averages is the way that
 * goes wrong.
 */

const stat = (overrides: Partial<TeamTaskStat>): TeamTaskStat => ({
  id: "1-1-2026-03",
  team_id: 1,
  sales_id: 1,
  month: "2026-03-01",
  nb_created: 0,
  nb_completed: 0,
  nb_completed_on_time: 0,
  avg_cycle_hours: null,
  ...overrides,
});

describe("taskFlowByMonth", () => {
  test("adds each member's counts into the month they belong to", () => {
    // Arrange: two members, same month.
    const stats = [
      stat({
        sales_id: 1,
        nb_created: 5,
        nb_completed: 3,
        nb_completed_on_time: 2,
      }),
      stat({
        sales_id: 2,
        nb_created: 4,
        nb_completed: 6,
        nb_completed_on_time: 6,
      }),
    ];

    // Act
    const points = taskFlowByMonth(stats);

    // Assert
    expect(points).toHaveLength(1);
    expect(points[0].created).toBe(9);
    expect(points[0].completed).toBe(9);
    expect(points[0].completedOnTime).toBe(8);
  });

  test("weights cycle time by volume instead of averaging the averages", () => {
    // Arrange: one member closed 1 task in 100h, the other closed 9 in 10h.
    // A plain mean of the two averages says 55h; the truth is 19h.
    const stats = [
      stat({ sales_id: 1, nb_completed: 1, avg_cycle_hours: 100 }),
      stat({ sales_id: 2, nb_completed: 9, avg_cycle_hours: 10 }),
    ];

    // Act
    const points = taskFlowByMonth(stats);

    // Assert
    expect(points[0].avgCycleHours).toBe(19);
  });

  test("reports no cycle time for a month nobody closed anything in", () => {
    // Null, not zero: zero draws a bar claiming tasks closed instantly.
    const points = taskFlowByMonth([stat({ nb_created: 7 })]);

    expect(points[0].created).toBe(7);
    expect(points[0].avgCycleHours).toBeNull();
  });

  test("ignores a member's null cycle time instead of dragging the mean to zero", () => {
    const stats = [
      stat({ sales_id: 1, nb_completed: 4, avg_cycle_hours: 20 }),
      stat({
        sales_id: 2,
        nb_created: 3,
        nb_completed: 0,
        avg_cycle_hours: null,
      }),
    ];

    const points = taskFlowByMonth(stats);

    expect(points[0].avgCycleHours).toBe(20);
  });

  test("orders the months oldest first, whatever order the cube arrived in", () => {
    const stats = [
      stat({ month: "2026-05-01", nb_created: 1 }),
      stat({ month: "2026-02-01", nb_created: 1 }),
      stat({ month: "2026-11-01", nb_created: 1 }),
    ];

    expect(taskFlowByMonth(stats).map((point) => point.month)).toEqual([
      "2026-02-01",
      "2026-05-01",
      "2026-11-01",
    ]);
  });

  test("returns an empty series when the cube has not loaded", () => {
    expect(taskFlowByMonth(undefined)).toEqual([]);
  });
});

describe("taskFlowTotals", () => {
  test("totals the period and derives the on-time rate from one window", () => {
    // Arrange
    const points = taskFlowByMonth([
      stat({
        month: "2026-01-01",
        nb_created: 10,
        nb_completed: 8,
        nb_completed_on_time: 6,
      }),
      stat({
        month: "2026-02-01",
        nb_created: 6,
        nb_completed: 12,
        nb_completed_on_time: 9,
      }),
    ]);

    // Act
    const totals = taskFlowTotals(points);

    // Assert
    expect(totals.created).toBe(16);
    expect(totals.completed).toBe(20);
    expect(totals.onTimeRate).toBe(0.75);
  });

  test("reports no on-time rate for a period with nothing completed", () => {
    const totals = taskFlowTotals(taskFlowByMonth([stat({ nb_created: 4 })]));

    expect(totals.onTimeRate).toBeNull();
    expect(totals.avgCycleHours).toBeNull();
  });

  test("weights the period cycle time by each month's volume", () => {
    // Arrange: 1 task at 100h in January, 9 at 10h in February.
    const points = taskFlowByMonth([
      stat({ month: "2026-01-01", nb_completed: 1, avg_cycle_hours: 100 }),
      stat({ month: "2026-02-01", nb_completed: 9, avg_cycle_hours: 10 }),
    ]);

    // Act / Assert
    expect(taskFlowTotals(points).avgCycleHours).toBe(19);
  });

  test("returns zeroes for an empty period rather than throwing", () => {
    const totals = taskFlowTotals([]);

    expect(totals.created).toBe(0);
    expect(totals.onTimeRate).toBeNull();
  });
});

describe("formatCycleTime", () => {
  test("keeps hours readable and switches to days past two of them", () => {
    expect(formatCycleTime(31.4)).toBe("31h");
    expect(formatCycleTime(56)).toBe("2.3d");
  });

  test("renders a missing cycle time as an em dash, not as zero hours", () => {
    expect(formatCycleTime(null)).toBe("—");
  });
});
