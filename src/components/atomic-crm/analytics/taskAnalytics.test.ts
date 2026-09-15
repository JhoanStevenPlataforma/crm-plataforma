import { describe, expect, it } from "vitest";

import type { TaskFlowStat, TaskStockStat, TaskTypeStat } from "../types";
import {
  averageCycleHours,
  onTimeRate,
  openNotOverdue,
  ownerWorkloadSeries,
  stockTotals,
  taskTotals,
  typeSeries,
} from "./taskAnalytics";

const flowRow = (over: Partial<TaskFlowStat>): TaskFlowStat => ({
  month: "2026-01-01",
  nb_created: 0,
  nb_completed: 0,
  nb_completed_on_time: 0,
  avg_cycle_hours: null,
  ...over,
});

const stockRow = (over: Partial<TaskStockStat>): TaskStockStat => ({
  sales_id: 1,
  owner_name: "Someone",
  nb_open: 0,
  nb_overdue: 0,
  nb_due_next_7d: 0,
  ...over,
});

describe("stockTotals", () => {
  it("sums the per-owner rows into the headline tiles", () => {
    // The tiles and the per-owner chart come from ONE call precisely so they
    // cannot contradict each other.
    const totals = stockTotals([
      stockRow({ sales_id: 1, nb_open: 10, nb_overdue: 3, nb_due_next_7d: 2 }),
      stockRow({ sales_id: 2, nb_open: 5, nb_overdue: 1, nb_due_next_7d: 1 }),
    ]);

    expect(totals).toEqual({ open: 15, overdue: 4, dueNext7d: 3 });
  });
});

describe("openNotOverdue", () => {
  it("subtracts overdue out of open before anything stacks them", () => {
    // Overdue is a SUBSET of open. Stacked without this subtraction, every late
    // task is drawn twice and the bar is taller than the team's real workload.
    expect(openNotOverdue({ open: 10, overdue: 3, dueNext7d: 0 })).toBe(7);
  });

  it("never goes negative if the two counters disagree", () => {
    expect(openNotOverdue({ open: 2, overdue: 5, dueNext7d: 0 })).toBe(0);
  });
});

describe("onTimeRate", () => {
  it("divides on-time completions by every completion", () => {
    const totals = taskTotals([
      flowRow({ nb_completed: 10, nb_completed_on_time: 7 }),
    ]);

    expect(onTimeRate(totals)).toBeCloseTo(0.7, 6);
  });

  it("cannot exceed 100% when tasks have no due date", () => {
    // The SQL counts a task with no due date as on time so that numerator and
    // denominator cover the same population. If that ever drifts, this is the
    // assertion that catches it.
    const totals = taskTotals([
      flowRow({ nb_completed: 4, nb_completed_on_time: 4 }),
    ]);

    expect(onTimeRate(totals)).toBe(1);
  });

  it("is null when nothing was completed", () => {
    expect(onTimeRate(taskTotals([flowRow({ nb_created: 9 })]))).toBeNull();
  });
});

describe("averageCycleHours", () => {
  it("weights each month by its completions rather than averaging averages", () => {
    // Arrange — one task at 1 h, then ninety-nine at 100 h.
    const totals = taskTotals([
      flowRow({ month: "2026-01-01", nb_completed: 1, avg_cycle_hours: 1 }),
      flowRow({ month: "2026-02-01", nb_completed: 99, avg_cycle_hours: 100 }),
    ]);

    // Act / Assert
    expect(averageCycleHours(totals)).toBeCloseTo(9901 / 100, 6);
    expect(averageCycleHours(totals)).not.toBeCloseTo(50.5, 1);
  });
});

describe("typeSeries", () => {
  it("ranks the activity mix busiest first", () => {
    const stats: TaskTypeStat[] = [
      { type_key: "email", type_label: "Email", nb_completed: 3 },
      { type_key: "call", type_label: "Call", nb_completed: 12 },
    ];

    expect(typeSeries(stats).map((point) => point.key)).toEqual([
      "call",
      "email",
    ]);
  });

  it("falls back to the key when a type has no label", () => {
    expect(
      typeSeries([{ type_key: "demo", type_label: "", nb_completed: 1 }])[0]
        .label,
    ).toBe("demo");
  });
});

describe("ownerWorkloadSeries", () => {
  it("applies the overdue subtraction so the three series stack honestly", () => {
    const { points } = ownerWorkloadSeries([
      stockRow({ sales_id: 1, nb_open: 10, nb_overdue: 4 }),
    ]);

    expect(points[0].open).toBe(6);
    expect(points[0].overdue).toBe(4);
  });

  it("ranks by total workload and reports what it dropped", () => {
    const stats = Array.from({ length: 12 }, (_, index) =>
      stockRow({ sales_id: index, nb_open: index + 1 }),
    );

    const { points, hidden } = ownerWorkloadSeries(stats, 10);

    expect(points[0].salesId).toBe(11);
    expect(points).toHaveLength(10);
    expect(hidden).toBe(2);
  });

  it("leaves out owners carrying nothing", () => {
    // A row of zeroes is a roster entry, not a workload, and it pushes real
    // bars off a truncated chart.
    const { points } = ownerWorkloadSeries([
      stockRow({ sales_id: 1, nb_open: 0 }),
      stockRow({ sales_id: 2, nb_open: 3 }),
    ]);

    expect(points.map((point) => point.salesId)).toEqual([2]);
  });
});
