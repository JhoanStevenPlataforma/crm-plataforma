import { describe, expect, test } from "vitest";

import { postponeDueDate } from "./postponeTask";

/**
 * Regression tests for proposal §1.3 W4. Each one fails against the original
 * `new Date(Date.now() + 24h).toISOString().slice(0, 10)` implementation.
 */
describe("postponeDueDate", () => {
  // A Tuesday, so "next week" never lands on a month boundary by accident.
  const now = new Date("2026-08-04T15:42:11.000Z");

  test("preserves the time of day when postponing to tomorrow", () => {
    const result = postponeDueDate("2026-08-04T09:30:00.000Z", "tomorrow", now);

    const parsed = new Date(result);
    expect(parsed.getHours()).toBe(
      new Date("2026-08-04T09:30:00.000Z").getHours(),
    );
    expect(parsed.getMinutes()).toBe(30);
  });

  test("does not truncate the due date to midnight", () => {
    const result = postponeDueDate("2026-08-04T09:30:00.000Z", "tomorrow", now);

    // The defect this guards: `.slice(0, 10)` produced a date-only string that
    // Postgres cast to 00:00.
    expect(result).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(result).getHours()).not.toBe(0);
  });

  test("moves an overdue task to tomorrow rather than leaving it in the past", () => {
    const result = postponeDueDate("2026-07-20T09:00:00.000Z", "tomorrow", now);

    expect(new Date(result).getTime()).toBeGreaterThan(now.getTime());
    expect(new Date(result).getDate()).toBe(5);
  });

  test("keeps the original time of day even for an overdue task", () => {
    const overdue = new Date("2026-07-20T09:00:00.000Z");
    const result = postponeDueDate(overdue, "tomorrow", now);

    expect(new Date(result).getHours()).toBe(overdue.getHours());
    expect(new Date(result).getMinutes()).toBe(overdue.getMinutes());
  });

  test("postpones a week from today, not a week from the old due date", () => {
    const result = postponeDueDate(
      "2026-07-20T09:00:00.000Z",
      "next_week",
      now,
    );

    // 7 days from 2026-08-04, not 7 days from 2026-07-20.
    expect(new Date(result).getDate()).toBe(11);
    expect(new Date(result).getMonth()).toBe(7); // August
  });

  test("falls back to the current time when the task has no due date", () => {
    const result = postponeDueDate(null, "tomorrow", now);

    expect(new Date(result).getHours()).toBe(now.getHours());
    expect(new Date(result).getMinutes()).toBe(now.getMinutes());
  });

  test("falls back to the current time when the due date is unparseable", () => {
    const result = postponeDueDate("not-a-date", "tomorrow", now);

    expect(new Date(result).getHours()).toBe(now.getHours());
  });

  test("always returns a full ISO timestamp", () => {
    const result = postponeDueDate(
      "2026-08-04T09:30:00.000Z",
      "next_week",
      now,
    );

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
