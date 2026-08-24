import type { TeamMember } from "../types";

/**
 * How a roster row names the person.
 *
 * `team_members_summary` carries the name, so no screen resolves a sale to
 * print one. The `#id` fallback is for the window between adding a member and
 * the roster reloading, where the name is genuinely not known yet — printing an
 * empty cell there looks like a member with no name rather than a row still
 * loading.
 */
export const memberNameOf = (member: TeamMember) =>
  [member.first_name, member.last_name].filter(Boolean).join(" ") ||
  `#${member.sales_id}`;
