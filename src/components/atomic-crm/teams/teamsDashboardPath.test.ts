import { describe, expect, test } from "vitest";

import {
  memberStatsLinkFor,
  TEAM_MEMBER_STATS_PATH,
  TEAM_STATS_PATH,
  TEAMS_DASHBOARD_PATH,
  teamStatsLinkFor,
} from "./teamsDashboardPath";

/**
 * A link that does not match the route it points at renders as a blank page,
 * not as an error — so the thing worth pinning is that the builders produce
 * something the declared patterns actually match.
 */
const matches = (pattern: string, url: string) =>
  new RegExp(`^${pattern.replace(/:[^/]+/g, "[^/]+")}$`).test(url);

describe("teamStatsLinkFor", () => {
  test("builds a url the team stats route matches", () => {
    expect(matches(TEAM_STATS_PATH, teamStatsLinkFor(7))).toBe(true);
  });

  test("carries the team id", () => {
    expect(teamStatsLinkFor(7)).toBe("/teams-dashboard/team/7");
  });
});

describe("memberStatsLinkFor", () => {
  test("builds a url the member stats route matches", () => {
    expect(matches(TEAM_MEMBER_STATS_PATH, memberStatsLinkFor(42))).toBe(true);
  });

  test("carries the membership id, not the person's", () => {
    // The same rep in two teams has two quotas; the page has to know which.
    expect(memberStatsLinkFor(42)).toBe("/teams-dashboard/member/42");
  });
});

describe("the dashboard route", () => {
  test("stays outside the teams resource, which owns /teams/:id", () => {
    expect(TEAMS_DASHBOARD_PATH.startsWith("/teams/")).toBe(false);
  });

  test("is a prefix of both drill-downs, so back links stay inside it", () => {
    expect(TEAM_STATS_PATH.startsWith(`${TEAMS_DASHBOARD_PATH}/`)).toBe(true);
    expect(TEAM_MEMBER_STATS_PATH.startsWith(`${TEAMS_DASHBOARD_PATH}/`)).toBe(
      true,
    );
  });
});
