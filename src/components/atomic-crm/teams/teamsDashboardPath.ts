import type { Identifier } from "ra-core";

/**
 * Routes of the team budget dashboard and its two drill-downs.
 *
 * Deliberately NOT under `/teams/...`: the `teams` resource already owns
 * `/teams/:id`, and a sibling segment there would be one router ranking rule
 * away from being read as a team whose id is the string "dashboard".
 *
 * Its own module so `TeamList` can link to the dashboard without importing it,
 * which would be a cycle — the dashboard links back to the list. The builders
 * live here too, so a route pattern and the links pointing at it cannot drift.
 */
export const TEAMS_DASHBOARD_PATH = "/teams-dashboard";

export const TEAM_STATS_PATH = "/teams-dashboard/team/:teamId";

/**
 * The member drill-down is keyed on the `team_members` row, not on the person:
 * the same rep can be rostered in two teams, and their quota, their won amount
 * and their attainment are all different in each.
 */
export const TEAM_MEMBER_STATS_PATH = "/teams-dashboard/member/:memberId";

export const teamStatsLinkFor = (teamId: Identifier) =>
  `${TEAMS_DASHBOARD_PATH}/team/${teamId}`;

export const memberStatsLinkFor = (memberId: Identifier) =>
  `${TEAMS_DASHBOARD_PATH}/member/${memberId}`;
