import { describe, expect, it } from "vitest";

import { formatMoney, formatMoneyExact } from "./reporting";

describe("formatMoneyExact", () => {
  it("prints the whole amount where the dashboard formatter abbreviates it", () => {
    expect(formatMoney(9_200_000, "USD")).toBe("$9.2M");
    expect(formatMoneyExact(9_200_000, "USD")).toBe("$9,200,000.00");
  });

  it("keeps the cents a price carries", () => {
    expect(formatMoneyExact(1234.5, "USD")).toBe("$1,234.50");
  });

  it("shows the two stored decimals even for a currency the browser prints without them", () => {
    // Chromium's currency data gives COP no decimals; the database stores two.
    expect(formatMoneyExact(9_200_000, "COP")).toBe("$9,200,000.00");
    expect(formatMoneyExact(1500.5, "COP")).toBe("$1,500.50");
  });

  it("formats in the currency it is given, not a default", () => {
    expect(formatMoneyExact(1500, "EUR")).toBe("€1,500.00");
  });

  it("renders a missing amount as a dash rather than a price of zero", () => {
    expect(formatMoneyExact(null, "USD")).toBe("—");
    expect(formatMoneyExact(0, "USD")).toBe("$0.00");
  });
});
