import { describe, expect, test } from "vitest";

import { computeNextFireAt } from "./taskReminderSchedule";

const NOW = new Date("2026-08-05T10:00:00.000Z");

describe("computeNextFireAt", () => {
  test("fires one hour before a future due date", () => {
    // Arrange
    const due = "2026-08-06T09:00:00.000Z";

    // Act
    const next = computeNextFireAt(
      {
        schedule_kind: "relative_before_due",
        offset_minutes: 60,
        rrule: null,
        absolute_at: null,
        until_at: null,
      },
      due,
      NOW,
    );

    // Assert
    expect(next).toBe("2026-08-06T08:00:00.000Z");
  });

  test("drops a before-due reminder whose moment has already passed", () => {
    const next = computeNextFireAt(
      {
        schedule_kind: "relative_before_due",
        offset_minutes: 60,
        rrule: null,
        absolute_at: null,
        until_at: null,
      },
      // Due in 30 minutes, so "one hour before" is already behind us.
      "2026-08-05T10:30:00.000Z",
      NOW,
    );

    expect(next).toBeNull();
  });

  test("still fires an after-due chase whose moment has passed", () => {
    const next = computeNextFireAt(
      {
        schedule_kind: "relative_after_due",
        offset_minutes: 60,
        rrule: null,
        absolute_at: null,
        until_at: null,
      },
      "2026-08-04T09:00:00.000Z",
      NOW,
    );

    expect(next).toBe("2026-08-04T10:00:00.000Z");
  });

  test("returns null for a relative rule on a task with no due date", () => {
    const next = computeNextFireAt(
      {
        schedule_kind: "relative_before_due",
        offset_minutes: 60,
        rrule: null,
        absolute_at: null,
        until_at: null,
      },
      null,
      NOW,
    );

    expect(next).toBeNull();
  });

  test("a one-shot that already fired never fires again", () => {
    const next = computeNextFireAt(
      {
        schedule_kind: "absolute",
        offset_minutes: null,
        rrule: null,
        absolute_at: "2026-09-01T08:00:00.000Z",
        until_at: null,
      },
      null,
      NOW,
      1,
    );

    expect(next).toBeNull();
  });

  test("keeps an absolute rule that has not fired", () => {
    const next = computeNextFireAt(
      {
        schedule_kind: "absolute",
        offset_minutes: null,
        rrule: null,
        absolute_at: "2026-09-01T08:00:00.000Z",
        until_at: null,
      },
      null,
      NOW,
      0,
    );

    expect(next).toBe("2026-09-01T08:00:00.000Z");
  });

  test("walks a daily rule to the next slot in the future", () => {
    const next = computeNextFireAt(
      {
        schedule_kind: "recurring",
        offset_minutes: null,
        rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
        absolute_at: null,
        until_at: null,
      },
      null,
      // Local 09:00 today is already past when "now" is later in the day, so
      // the next slot must be tomorrow.
      new Date(2026, 7, 5, 10, 0, 0),
    );

    expect(next).not.toBeNull();
    const fired = new Date(next as string);
    expect(fired.getHours()).toBe(9);
    expect(fired.getDate()).toBe(6);
  });

  test("walks a weekly rule to the next matching weekday", () => {
    const next = computeNextFireAt(
      {
        schedule_kind: "recurring",
        offset_minutes: null,
        rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0",
        absolute_at: null,
        until_at: null,
      },
      null,
      // 2026-08-05 is a Wednesday.
      new Date(2026, 7, 5, 10, 0, 0),
    );

    expect(next).not.toBeNull();
    const fired = new Date(next as string);
    // 1 === Monday
    expect(fired.getDay()).toBe(1);
    expect(fired.getHours()).toBe(9);
  });

  test("returns null for a frequency the demo does not implement", () => {
    const next = computeNextFireAt(
      {
        schedule_kind: "recurring",
        offset_minutes: null,
        rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
        absolute_at: null,
        until_at: null,
      },
      null,
      NOW,
    );

    expect(next).toBeNull();
  });

  test("respects until_at", () => {
    const next = computeNextFireAt(
      {
        schedule_kind: "relative_before_due",
        offset_minutes: 60,
        rrule: null,
        absolute_at: null,
        until_at: "2026-08-05T12:00:00.000Z",
      },
      "2026-08-09T09:00:00.000Z",
      NOW,
    );

    expect(next).toBeNull();
  });
});
