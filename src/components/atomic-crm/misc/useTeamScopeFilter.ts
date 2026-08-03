import { useGetIdentity, type Identifier } from "ra-core";

import type { CrmRole } from "../types";

/**
 * Filter fragment for the dashboard overview widgets.
 *
 * Before roles existed, every widget hard-filtered on the signed-in user's
 * `sales_id`. That is now wrong for a sales manager, whose job is precisely to
 * watch the whole team, and redundant for a sales rep, whose rows are already
 * narrowed by row level security.
 *
 * Returns an empty filter for admins and managers (team-wide view) and the
 * personal filter for everyone else.
 *
 * Not for personal to-do widgets such as "my tasks": those stay personal for
 * every role.
 */
export const useTeamScopeFilter = (): { sales_id?: Identifier } => {
  const { identity } = useGetIdentity();
  const role = identity?.role as CrmRole | undefined;

  if (role === "admin" || role === "manager") {
    return {};
  }

  return { sales_id: identity?.id };
};
