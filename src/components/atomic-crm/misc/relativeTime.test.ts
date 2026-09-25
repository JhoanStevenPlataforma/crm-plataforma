import { describe, expect, it } from "vitest";

import { calendarDaysBetween, formatRelativeDay } from "./relativeTime";

const now = new Date(2026, 8, 24, 23, 0);

describe("calendarDaysBetween", () => {
  it("counts tomorrow morning as one day away late at night", () => {
    expect(calendarDaysBetween(new Date(2026, 8, 25, 9, 0), now)).toBe(1);
  });

  it("is negative for past dates", () => {
    expect(calendarDaysBetween(new Date(2026, 8, 20, 12, 0), now)).toBe(-4);
  });
});

describe("formatRelativeDay", () => {
  it("names tomorrow and yesterday in words", () => {
    expect(formatRelativeDay(new Date(2026, 8, 25, 9, 0), "en", now)).toBe(
      "tomorrow",
    );
    expect(formatRelativeDay(new Date(2026, 8, 23, 9, 0), "es", now)).toBe(
      "ayer",
    );
  });

  it("switches to weeks, months and years as the gap grows", () => {
    expect(formatRelativeDay(new Date(2026, 8, 10), "en", now)).toBe(
      "2 weeks ago",
    );
    expect(formatRelativeDay(new Date(2026, 3, 15), "en", now)).toBe(
      "5 months ago",
    );
    expect(formatRelativeDay(new Date(2024, 8, 1), "en", now)).toBe(
      "2 years ago",
    );
  });
});
