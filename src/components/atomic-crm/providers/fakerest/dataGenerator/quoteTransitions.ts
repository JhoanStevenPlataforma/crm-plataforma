import type { QuoteTransition } from "../../../types";

/**
 * The legal edges `20260913120000_quotes_module.sql` seeds, so demo mode offers
 * the same buttons and refuses the same moves as the real backend.
 *
 * The graph is DATA in both places for the same reason (quotes §3): a move
 * list written as an `if` is one nobody tunes, and one written with literal
 * status names is wrong for the first customer who renames a status. Mirroring
 * it here is what lets `QuoteActions` read the machine instead of hard-coding
 * which button a status offers.
 *
 * Three edges are deliberately absent, and their absence is the rule rather
 * than an omission: `accepted -> draft` (an accepted quote is a commitment),
 * anything out of `canceled`, and `pending_approval -> sent` (which would make
 * the approval step decorative).
 */
const EDGES: [
  QuoteTransition["from_status_key"],
  QuoteTransition["to_status_key"],
  string,
  boolean,
  boolean,
  QuoteTransition["allowed_actor"],
][] = [
  // Approval
  ["draft", "pending_approval", "Request approval", false, false, "internal"],
  ["pending_approval", "approved", "Approve", true, false, "internal"],
  ["pending_approval", "draft", "Send back", true, false, "internal"],
  // Issue: only `issue_quote_version()` reaches these, because it is the path
  // that stamps the version the transition requires.
  ["draft", "sent", "Send", false, true, "internal"],
  ["approved", "sent", "Send", false, true, "internal"],
  // The customer, on the portal (Phase 7)
  ["sent", "viewed", "Viewed", false, true, "customer"],
  ["viewed", "under_review", "Under review", false, true, "customer"],
  ["sent", "accepted", "Accept", false, true, "customer"],
  ["viewed", "accepted", "Accept", false, true, "customer"],
  ["under_review", "accepted", "Accept", false, true, "customer"],
  ["negotiating", "accepted", "Accept", false, true, "customer"],
  ["sent", "rejected", "Reject", false, true, "customer"],
  ["viewed", "rejected", "Reject", false, true, "customer"],
  ["under_review", "rejected", "Reject", false, true, "customer"],
  ["negotiating", "rejected", "Reject", false, true, "customer"],
  // Negotiation, driven by the rep
  ["sent", "negotiating", "Negotiate", false, true, "internal"],
  ["viewed", "negotiating", "Negotiate", false, true, "internal"],
  ["under_review", "negotiating", "Negotiate", false, true, "internal"],
  // Revision (`revise_quote()`), always with a reason
  ["sent", "draft", "Revise", true, false, "internal"],
  ["viewed", "draft", "Revise", true, false, "internal"],
  ["under_review", "draft", "Revise", true, false, "internal"],
  ["negotiating", "draft", "Revise", true, false, "internal"],
  ["rejected", "draft", "Revise", true, false, "internal"],
  ["expired", "draft", "Revise", true, false, "internal"],
  // Expiry, the sweeper's
  ["sent", "expired", "Expire", false, false, "system"],
  ["viewed", "expired", "Expire", false, false, "system"],
  ["under_review", "expired", "Expire", false, false, "system"],
  // Cancellation, from anything still open, always with a reason
  ["draft", "canceled", "Cancel", true, false, "internal"],
  ["pending_approval", "canceled", "Cancel", true, false, "internal"],
  ["approved", "canceled", "Cancel", true, false, "internal"],
  ["sent", "canceled", "Cancel", true, false, "internal"],
  ["viewed", "canceled", "Cancel", true, false, "internal"],
  ["under_review", "canceled", "Cancel", true, false, "internal"],
  ["negotiating", "canceled", "Cancel", true, false, "internal"],
];

export const DEMO_QUOTE_TRANSITIONS: QuoteTransition[] = EDGES.map(
  (
    [
      from_status_key,
      to_status_key,
      label,
      requires_reason,
      requires_issued_version,
      allowed_actor,
    ],
    index,
  ) => ({
    id: index + 1,
    from_status_key,
    to_status_key,
    label,
    requires_reason,
    requires_issued_version,
    allowed_actor,
    is_system: true,
  }),
);
