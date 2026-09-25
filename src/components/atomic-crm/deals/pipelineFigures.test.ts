import { describe, expect, it } from "vitest";

import type { Deal, DealStage } from "../types";
import {
  closeDateStatus,
  parseCalendarDate,
  summarizePipeline,
} from "./pipelineFigures";

const stages: DealStage[] = [
  { value: "opportunity", label: "Opportunity", probability: 0.2 },
  { value: "proposal", label: "Proposal", probability: 0.5 },
  { value: "delayed", label: "Delayed" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const deal = (overrides: Partial<Deal>): Deal =>
  ({
    id: 1,
    name: "Deal",
    amount: 1000,
    stage: "opportunity",
    expected_closing_date: "2026-12-01",
    ...overrides,
  }) as Deal;

const now = new Date(2026, 8, 24, 10, 0);

describe("summarizePipeline", () => {
  it("counts open stages only and weights them by stage probability", () => {
    const summary = summarizePipeline(
      [
        deal({ id: 1, amount: 1000, stage: "opportunity" }),
        deal({ id: 2, amount: 2000, stage: "proposal" }),
        deal({ id: 3, amount: 500, stage: "delayed" }),
        deal({ id: 4, amount: 9000, stage: "won" }),
        deal({ id: 5, amount: 7000, stage: "lost" }),
      ],
      stages,
      ["won", "lost"],
      now,
    );

    expect(summary.openAmount).toBe(3500);
    expect(summary.openCount).toBe(3);
    expect(summary.weightedAmount).toBe(1000 * 0.2 + 2000 * 0.5);
    // A stage with no probability is reported, never silently weighted at 0.
    expect(summary.unweightedAmount).toBe(500);
    expect(summary.stages.map((s) => s.stage)).toEqual([
      "opportunity",
      "proposal",
      "delayed",
    ]);
    expect(summary.stages[1].share).toBeCloseTo(2000 / 3500);
  });

  it("separates deals past their close date from those closing this month", () => {
    const summary = summarizePipeline(
      [
        deal({ id: 1, amount: 100, expected_closing_date: "2026-09-10" }),
        deal({ id: 2, amount: 300, expected_closing_date: "2026-09-30" }),
        deal({ id: 3, amount: 900, expected_closing_date: "2026-10-02" }),
        deal({ id: 4, stage: "won", expected_closing_date: "2026-09-01" }),
      ],
      stages,
      ["won", "lost"],
      now,
    );

    expect(summary.overdueCount).toBe(1);
    expect(summary.closingThisMonth).toEqual({ count: 1, amount: 300 });
  });
});

describe("closeDateStatus", () => {
  it("reads a bare date in local time, not as UTC midnight", () => {
    expect(parseCalendarDate("2026-09-24")).toEqual(new Date(2026, 8, 24));
    expect(closeDateStatus("2026-09-24", now)).toBe("soon");
  });

  it("flags past dates, the next seven days, and later ones", () => {
    expect(closeDateStatus("2026-09-23", now)).toBe("overdue");
    expect(closeDateStatus("2026-10-01", now)).toBe("soon");
    expect(closeDateStatus("2026-10-02", now)).toBe("later");
    expect(closeDateStatus(null, now)).toBeNull();
  });
});
