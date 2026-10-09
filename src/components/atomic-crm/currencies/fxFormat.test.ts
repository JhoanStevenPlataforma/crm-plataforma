import { afterEach, describe, expect, it, vi } from "vitest";

import { serverToday } from "./fxFormat";

describe("serverToday (parity with the database's current_date)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // 22:44 in Bogota is 03:44 UTC of the next day: the database is already on
  // the 9th, and a rate dated the 8th would never become the current one.
  it("returns the UTC day in the evening of a timezone behind UTC", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T03:44:00Z"));

    expect(serverToday()).toBe("2026-10-09");
  });

  it("returns the UTC day in the morning of a timezone ahead of UTC", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T22:30:00Z"));

    expect(serverToday()).toBe("2026-10-08");
  });
});
