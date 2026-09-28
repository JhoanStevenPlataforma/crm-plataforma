import { describe, expect, it } from "vitest";

import { isPhoneNumber, isRevenue } from "./fieldValidators";

describe("isPhoneNumber", () => {
  it.each([
    "",
    "+57 300 123 4567",
    "(601) 555-0100",
    "601.555.0100",
    "+34 91 123 45 67 ext 204",
  ])("accepts %j", (value) => {
    expect(isPhoneNumber(value)).toBeUndefined();
  });

  it.each(["call me", "12345", "555-CALL-NOW", "+1 234 567 890 123 456 7"])(
    "refuses %j",
    (value) => {
      expect(isPhoneNumber(value)?.message).toBe(
        "crm.validation.invalid_phone",
      );
    },
  );
});

describe("isRevenue", () => {
  it.each(["", "$1M", "250000", "250.000", "1,5 MM", "€ 10 000", "3 millones"])(
    "accepts %j",
    (value) => {
      expect(isRevenue(value)).toBeUndefined();
    },
  );

  it.each(["a lot", "unknown", "1M dollars", "--"])("refuses %j", (value) => {
    expect(isRevenue(value)?.message).toBe("crm.validation.invalid_revenue");
  });
});
