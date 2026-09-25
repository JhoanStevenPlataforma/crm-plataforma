import { describe, expect, test } from "vitest";

import { formatDayLabel, groupByDay } from "./activityDays";

const NOW = new Date(2026, 8, 24, 10, 0); // Thursday 24 September 2026

describe("formatDayLabel", () => {
  test("names today and yesterday in the reader's language", () => {
    expect(formatDayLabel(new Date(2026, 8, 24, 8, 0), "es", NOW)).toBe("Hoy");
    expect(formatDayLabel(new Date(2026, 8, 23, 23, 59), "es", NOW)).toBe(
      "Ayer",
    );
    expect(formatDayLabel(new Date(2026, 8, 24, 0, 1), "en", NOW)).toBe(
      "Today",
    );
  });

  test("gives older days their weekday and date, without the current year", () => {
    const label = formatDayLabel(new Date(2026, 8, 14, 12, 0), "es", NOW);
    expect(label).toBe("Lunes, 14 de septiembre");
  });

  test("adds the year when the day belongs to another year", () => {
    const label = formatDayLabel(new Date(2025, 6, 27, 12, 0), "es", NOW);
    expect(label).toContain("2025");
  });
});

describe("groupByDay", () => {
  test("groups consecutive items of one local day and keeps their order", () => {
    const items = [
      { id: 1, date: new Date(2026, 8, 24, 9, 0).toISOString() },
      { id: 2, date: new Date(2026, 8, 24, 7, 0).toISOString() },
      { id: 3, date: new Date(2026, 8, 22, 18, 0).toISOString() },
    ];

    const groups = groupByDay(items, (item) => item.date);

    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      [1, 2],
      [3],
    ]);
  });

  test("returns no groups for an empty feed", () => {
    expect(groupByDay([], () => "")).toEqual([]);
  });
});
