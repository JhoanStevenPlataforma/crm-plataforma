import type { TeamMember } from "../types";

/**
 * Who is actually carrying the team's number.
 *
 * The roster table already lists every member's won amount, but a table is read
 * top to bottom in whatever order it was sorted; this answers the question a
 * manager opens the page with — is the team's result the team's, or one
 * person's — which a column of numbers only answers after you add them up.
 *
 * Built from the roster rows the page has already fetched, so it costs no
 * request.
 */
export type ContributionPoint = {
  memberId: TeamMember["id"];
  name: string;
  won: number;
  /** Share of everything the team won in the period, 0..1. */
  share: number;
};

export const memberContribution = (
  members: TeamMember[] | undefined,
  nameOf: (member: TeamMember) => string,
): ContributionPoint[] => {
  const rows = members ?? [];
  const total = rows.reduce((sum, member) => sum + (member.won_amount ?? 0), 0);

  return (
    rows
      .map((member) => ({
        memberId: member.id,
        name: nameOf(member),
        won: member.won_amount ?? 0,
        // A team that has won nothing has no shares to divide, and 0/0 would put
        // every member at NaN%.
        share: total === 0 ? 0 : (member.won_amount ?? 0) / total,
      }))
      // Members who have won nothing are dropped rather than drawn as empty bars:
      // the chart is about who is carrying the number, and a row of zero-length
      // bars just makes the real ones shorter.
      .filter((point) => point.won > 0)
      .sort((a, b) => b.won - a.won)
  );
};
