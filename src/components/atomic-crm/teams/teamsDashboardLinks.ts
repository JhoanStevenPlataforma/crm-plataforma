import type { Identifier } from "ra-core";

/**
 * Deep links from the dashboard into the real list screens.
 *
 * The dashboard reports numbers; these take the manager to the rows behind
 * them. Kept in one module so the filter keys used here stay in step with the
 * filters actually registered on `DealList` and `ContactList` — a link with a
 * key no list declares silently returns everything, which reads as a bug in the
 * count rather than in the link.
 */
const toFilter = (filter: Record<string, Identifier>) =>
  encodeURIComponent(JSON.stringify(filter));

export const dealsLinkFor = ({
  teamId,
  salesId,
}: {
  teamId?: Identifier;
  salesId?: Identifier;
}) => {
  const filter: Record<string, Identifier> = {};
  if (teamId != null) filter.team_id = teamId;
  if (salesId != null) filter.sales_id = salesId;
  return `/deals?filter=${toFilter(filter)}`;
};

export const contactsLinkFor = (salesId: Identifier) =>
  `/contacts?filter=${toFilter({ sales_id: salesId })}`;
