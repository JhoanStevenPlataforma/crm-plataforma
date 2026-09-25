import { describe, expect, it } from "vitest";

import type { Deal } from "../types";
import {
  coolingCutoff,
  daysSinceTouch,
  openDealByContact,
} from "./hotContactSignals";

const deal = (overrides: Partial<Deal>): Deal =>
  ({
    id: 1,
    name: "Deal",
    amount: 1000,
    stage: "proposal",
    contact_ids: [],
    ...overrides,
  }) as Deal;

describe("openDealByContact", () => {
  it("names the largest open deal of each contact", () => {
    const result = openDealByContact(
      [
        deal({ id: 1, amount: 5000, contact_ids: [10, 11] }),
        deal({ id: 2, amount: 9000, contact_ids: [10] }),
      ],
      ["won", "lost"],
    );

    expect(result.get(10)?.id).toBe(2);
    expect(result.get(11)?.id).toBe(1);
  });

  it("ignores won, lost and archived deals", () => {
    const result = openDealByContact(
      [
        deal({ id: 1, amount: 9000, stage: "won", contact_ids: [10] }),
        deal({ id: 2, amount: 8000, stage: "lost", contact_ids: [10] }),
        deal({
          id: 3,
          amount: 7000,
          archived_at: "2026-01-01",
          contact_ids: [10],
        }),
      ],
      ["won", "lost"],
    );

    expect(result.has(10)).toBe(false);
  });
});

describe("cooling", () => {
  const now = new Date(2026, 8, 24, 15, 0);

  it("counts calendar days since the last touch", () => {
    expect(
      daysSinceTouch(new Date(2026, 8, 23, 23, 0).toISOString(), now),
    ).toBe(1);
  });

  it("puts the cutoff fourteen calendar days back, at midnight", () => {
    expect(new Date(coolingCutoff(now))).toEqual(new Date(2026, 8, 10));
  });
});
