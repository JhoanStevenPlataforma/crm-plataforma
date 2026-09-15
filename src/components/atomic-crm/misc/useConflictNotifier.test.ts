import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./useConflictNotifier";

describe("isUniqueViolation", () => {
  it("recognises the PostgREST body the data provider attaches to its error", () => {
    expect(
      isUniqueViolation({ message: "duplicate", body: { code: "23505" } }),
    ).toBe(true);
  });

  it("recognises a code carried on the error itself", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("does not mistake any other failure for a conflict", () => {
    for (const error of [
      { body: { code: "23514" } },
      new Error("network down"),
      null,
      undefined,
    ]) {
      expect(isUniqueViolation(error)).toBe(false);
    }
  });
});
