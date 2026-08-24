import { useGetList, type Identifier } from "ra-core";

import type { TeamMember } from "../types";

/**
 * One team's roster, fetched once however many components ask for it.
 *
 * The team page renders both the roster table and the workload chart from the
 * same rows. Two `useGetList` calls with even slightly different params are two
 * query keys and therefore two HTTP requests, so the params live here rather
 * than being retyped at each call site — react-query then dedupes them into a
 * single round trip and the two views can never disagree about who is on the
 * team.
 */
export const useTeamRoster = (teamId: Identifier | undefined) =>
  useGetList<TeamMember>(
    "team_members",
    {
      filter: { team_id: teamId },
      sort: { field: "last_name", order: "ASC" },
      pagination: { page: 1, perPage: 200 },
    },
    { enabled: teamId != null },
  );
