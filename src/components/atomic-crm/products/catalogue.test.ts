import { describe, expect, it } from "vitest";

import {
  labelOf,
  toCurrencyCode,
  validateCurrencyCode,
  validatePeriod,
} from "./catalogue";

describe("validatePeriod", () => {
  it("refuses an end date before the start date", () => {
    expect(validatePeriod("2026-01-31", { valid_from: "2026-02-01" })).toBe(
      "resources.price_lists.validation.period",
    );
  });

  it("accepts a period that ends on the day it starts", () => {
    expect(
      validatePeriod("2026-02-01", { valid_from: "2026-02-01" }),
    ).toBeUndefined();
  });

  it("leaves an open-ended period alone", () => {
    expect(validatePeriod(null, { valid_from: "2026-02-01" })).toBeUndefined();
    expect(validatePeriod("2026-02-01", { valid_from: null })).toBeUndefined();
  });
});

const UNITS = [
  { value: "unit", label: "Unit" },
  { value: "hour", label: "Hour" },
];

describe("labelOf", () => {
  it("returns the label configured for a value", () => {
    expect(labelOf(UNITS, "hour")).toBe("Hour");
  });

  it("falls back to the raw value once the configuration no longer lists it", () => {
    expect(labelOf(UNITS, "pallet")).toBe("pallet");
  });

  it("renders nothing for a missing value rather than a placeholder", () => {
    expect(labelOf(UNITS, null)).toBe("");
    expect(labelOf(UNITS, "")).toBe("");
  });
});

describe("currency codes", () => {
  it("accepts a three-letter ISO code in capitals", () => {
    expect(validateCurrencyCode("COP", {})).toBeUndefined();
  });

  it("refuses what the database check would refuse", () => {
    for (const value of ["cop", "CO", "COPS", "C0P"]) {
      expect(validateCurrencyCode(value, {})).toBeDefined();
    }
  });

  it("normalises typed input to the stored form", () => {
    expect(toCurrencyCode(" cop ")).toBe("COP");
    expect(toCurrencyCode(null)).toBe("");
  });
});
