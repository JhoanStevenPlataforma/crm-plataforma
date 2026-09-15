import type { QuoteStatus, QuoteStatusKey } from "../../../types";

/**
 * The eleven statuses `20260913120000_quotes_module.sql` seeds, so demo mode
 * shows the same badges and offers the same list filter as the real backend.
 *
 * `color` is carried because the table has the column, and no screen reads it:
 * the badge maps a status to a SEMANTIC token instead, per the design system's
 * one rule about colours (`QuoteStatusBadge`).
 */
const STATUSES: [QuoteStatusKey, string, string, boolean, boolean, boolean][] =
  [
    ["draft", "Draft", "gray", true, false, false],
    ["pending_approval", "Pending approval", "amber", true, false, false],
    ["approved", "Approved", "blue", true, false, false],
    ["sent", "Sent", "blue", true, false, false],
    ["viewed", "Viewed", "blue", true, false, false],
    ["under_review", "Under review", "blue", true, false, false],
    ["negotiating", "Negotiating", "amber", true, false, false],
    ["accepted", "Accepted", "green", false, true, true],
    ["rejected", "Rejected", "red", false, true, false],
    ["expired", "Expired", "gray", false, true, false],
    ["canceled", "Canceled", "gray", false, true, false],
  ];

export const DEMO_QUOTE_STATUSES: QuoteStatus[] = STATUSES.map(
  ([key, label, color, is_open, is_terminal, counts_as_won], index) => ({
    id: index + 1,
    key,
    label,
    color,
    rank: (index + 1) * 10,
    is_open,
    is_terminal,
    counts_as_won,
    is_system: true,
  }),
);
