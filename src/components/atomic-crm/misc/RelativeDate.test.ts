import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatLocalizedDate, formatRelativeDate } from "./RelativeDate";

// Pinned so `formatRelative` resolves the same branch on every run — its output
// depends on how far "now" is from the date.
const NOW = new Date("2026-03-12T10:00:00Z");
const YESTERDAY = "2026-03-11T15:00:00Z";
const LAST_MONTH = "2026-02-02T15:00:00Z";

describe("formatRelativeDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats a recent date in spanish", () => {
    expect(formatRelativeDate(YESTERDAY, "es")).toContain("ayer");
  });

  it("formats a recent date in french", () => {
    expect(formatRelativeDate(YESTERDAY, "fr")).toContain("hier");
  });

  it("formats a recent date in english", () => {
    expect(formatRelativeDate(YESTERDAY, "en")).toContain("yesterday");
  });

  it("honours a region-qualified locale", () => {
    expect(formatRelativeDate(YESTERDAY, "es-MX")).toContain("ayer");
  });

  it("falls back to english for an unsupported locale", () => {
    expect(formatRelativeDate(YESTERDAY, "de")).toContain("yesterday");
  });

  it("switches to a plain date beyond a week", () => {
    // Spanish is day-first, English month-first — proves the locale reached Intl.
    expect(formatRelativeDate(LAST_MONTH, "es")).toBe("2/2/2026");
    expect(formatRelativeDate(LAST_MONTH, "en")).toBe("2/2/2026");
    expect(formatRelativeDate("2026-02-03T15:00:00Z", "es")).toBe("3/2/2026");
    expect(formatRelativeDate("2026-02-03T15:00:00Z", "en")).toBe("2/3/2026");
  });
});

describe("formatLocalizedDate", () => {
  it("spells the month out in spanish", () => {
    expect(formatLocalizedDate(LAST_MONTH, "es")).toBe("2 de febrero de 2026");
  });

  it("spells the month out in english", () => {
    expect(formatLocalizedDate(LAST_MONTH, "en")).toBe("February 2, 2026");
  });
});
