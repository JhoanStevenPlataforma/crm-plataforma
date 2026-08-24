import { describe, expect, test } from "vitest";

import type { TeamMember } from "../types";
import { memberContribution } from "./memberContribution";

const member = (overrides: Partial<TeamMember>): TeamMember => ({
  id: 1,
  team_id: 1,
  sales_id: 1,
  ...overrides,
});

const nameOf = (m: TeamMember) => m.last_name ?? "";

describe("memberContribution", () => {
  test("ranks members by what they won and reports each one's share", () => {
    // Arrange
    const members = [
      member({ id: 1, last_name: "Small", won_amount: 100 }),
      member({ id: 2, last_name: "Big", won_amount: 300 }),
    ];

    // Act
    const points = memberContribution(members, nameOf);

    // Assert
    expect(points.map((point) => point.name)).toEqual(["Big", "Small"]);
    expect(points.map((point) => point.share)).toEqual([0.75, 0.25]);
  });

  test("leaves out members who have won nothing", () => {
    // A row of zero-length bars only makes the real ones shorter.
    const points = memberContribution(
      [
        member({ id: 1, last_name: "Seller", won_amount: 500 }),
        member({ id: 2, last_name: "Quiet", won_amount: 0 }),
        member({ id: 3, last_name: "New" }),
      ],
      nameOf,
    );

    expect(points.map((point) => point.name)).toEqual(["Seller"]);
  });

  test("returns nothing rather than NaN when the team has won nothing", () => {
    const points = memberContribution(
      [member({ id: 1, last_name: "Quiet", won_amount: 0 })],
      nameOf,
    );

    expect(points).toEqual([]);
  });

  test("returns an empty list when the roster has not loaded", () => {
    expect(memberContribution(undefined, nameOf)).toEqual([]);
  });
});
