import { describe, expect, it } from "vitest";

import { formatRemaining, idleStateAt } from "./idleSession";

describe("idleStateAt", () => {
  const timeout = 60_000;
  const warning = 10_000;

  it("is active until the warning window opens", () => {
    expect(idleStateAt(49_999, 0, timeout, warning)).toEqual({
      kind: "active",
    });
  });

  it("warns with the time left inside the window", () => {
    expect(idleStateAt(50_000, 0, timeout, warning)).toEqual({
      kind: "warning",
      remainingMs: 10_000,
    });
  });

  it("expires at the deadline, and long after it (a device waking up)", () => {
    expect(idleStateAt(60_000, 0, timeout, warning).kind).toBe("expired");
    expect(idleStateAt(5 * 3_600_000, 0, timeout, warning).kind).toBe(
      "expired",
    );
  });
});

describe("formatRemaining", () => {
  it("renders minutes and zero-padded seconds, rounding up", () => {
    expect(formatRemaining(120_000)).toBe("2:00");
    expect(formatRemaining(61_000)).toBe("1:01");
    expect(formatRemaining(1)).toBe("0:01");
  });
});
