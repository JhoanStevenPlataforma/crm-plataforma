import type { Identifier } from "ra-core";

import { calendarDaysBetween } from "../misc/relativeTime";
import type { Deal } from "../types";

/**
 * What the hot-contacts panel says about each row, derived from records the
 * panel already fetched — one deals query and one tasks query for the whole
 * page, never one per row.
 *
 * "Hot" itself is a status a rep sets by hand. Nothing here pretends to score
 * interest: the signals are facts (days since the last touch, the open deal,
 * the next task), so a reader can check every one of them.
 */

/**
 * Past this many days without a touch a hot contact is flagged as cooling. Two
 * weeks is the usual follow-up cadence of a live B2B opportunity; a contact
 * left longer than that is the one the panel exists to surface.
 */
export const COOLING_AFTER_DAYS = 14;

export const daysSinceTouch = (lastSeen: string, now: Date): number =>
  Math.max(0, -calendarDaysBetween(new Date(lastSeen), now));

/** ISO timestamp before which `last_seen` counts as cooling. */
export const coolingCutoff = (now: Date): string => {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - COOLING_AFTER_DAYS);
  return cutoff.toISOString();
};

/** A PostgREST list literal, `{1,2,3}` for `@cs` / `@ov`, `(1,2,3)` for `@in`. */
export const idList = (ids: Identifier[], brackets: "{}" | "()"): string =>
  `${brackets[0]}${ids.join(",")}${brackets[1]}`;

/**
 * The deal worth naming on each contact's row: the largest one still open.
 * A deal is closed when it is archived or sits in a terminal stage (`won`,
 * `lost`, or any configured pipeline status).
 */
export const openDealByContact = (
  deals: readonly Deal[],
  closedStages: readonly string[],
): Map<Identifier, Deal> => {
  const byContact = new Map<Identifier, Deal>();
  for (const deal of deals) {
    if (deal.archived_at || closedStages.includes(deal.stage)) continue;
    for (const contactId of deal.contact_ids ?? []) {
      const current = byContact.get(contactId);
      if (!current || deal.amount > current.amount) {
        byContact.set(contactId, deal);
      }
    }
  }
  return byContact;
};
