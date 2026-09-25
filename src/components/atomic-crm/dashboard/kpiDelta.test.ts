import { describe, expect, it } from "vitest";

import { compareAmounts, compareRates } from "./kpiDelta";

describe("compareAmounts", () => {
  it("gives a percentage over a non-zero base", () => {
    expect(compareAmounts(150, 100)).toEqual({
      kind: "percent",
      direction: "up",
      ratio: 0.5,
    });
    expect(compareAmounts(50, 100)).toMatchObject({
      direction: "down",
      ratio: -0.5,
    });
  });

  it("gives the absolute amount over a zero base instead of an infinite percentage", () => {
    expect(compareAmounts(57_100, 0)).toEqual({
      kind: "absolute",
      direction: "up",
      amount: 57_100,
    });
    expect(compareAmounts(0, 0)).toMatchObject({ direction: "flat" });
  });

  it("treats a sub-half-percent move as no change", () => {
    expect(compareAmounts(1002, 1000).direction).toBe("flat");
  });
});

describe("compareRates", () => {
  it("compares in percentage points", () => {
    expect(compareRates(0.5, 0.4)).toEqual({ direction: "up", points: 10 });
  });

  it("has nothing to say when either period decided no deal", () => {
    expect(compareRates(0.5, null)).toBeNull();
    expect(compareRates(null, 0.4)).toBeNull();
  });
});
