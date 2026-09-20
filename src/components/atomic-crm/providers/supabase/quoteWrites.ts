/**
 * Writing a quotation, which is two tables (quotes §13.2).
 *
 * The edit form binds `valid_until` and `terms` at the top level because that
 * is where a user thinks they live — on the quote. The database disagrees, for
 * a reason worth keeping: both columns exist on `quotes` AND on each version,
 * and the VERSION is the source. It is what the document prints and what a
 * portal link's expiry is clamped to, so the header is a server-kept mirror and
 * changing it is refused outright (`23514 quote_header_derived`).
 *
 * Routing them here rather than in the component keeps the form declarative and
 * gives every caller the same behaviour, exactly as a team's budget is routed
 * to `team_budgets`.
 */

import type { DataProvider, Identifier } from "ra-core";

import type { QuoteVersion } from "../../types";

/**
 * Columns that reach the quote form but may not be posted to `public.quotes`:
 * everything `quotes_summary` computes, plus the two the current version owns.
 *
 * A denylist rather than an allowlist, for the reason the teams one gives: a
 * genuinely new column on `quotes` then saves without anyone remembering to
 * register it, whereas the reverse choice fails silently the day somebody adds
 * one.
 */
const QUOTE_VIRTUAL_FIELDS = [
  "company_name",
  "deal_name",
  "owner_name",
  "status_label",
  "status_color",
  "status_is_open",
  "status_is_terminal",
  "status_counts_as_won",
  "current_version_id",
  "current_version_number",
  "issued_at",
  "subtotal",
  "discount_total",
  "tax_total",
  "total",
  "accepted_at",
  "rejected_at",
  "rejected_reason_code",
  "party_snapshot",
  "nb_issued_versions",
  "nb_lines",
  "nb_shared_comments",
  "nb_unanswered_customer_comments",
  "nb_views",
  "last_portal_activity_at",
  "nb_active_tokens",
] as const;

/** The version's own columns, which the header only mirrors. */
export const QUOTE_VERSION_FIELDS = ["valid_until", "terms"] as const;

export const stripQuoteVirtuals = (
  data: Record<string, any> | undefined,
  { keepVersionFields = false } = {},
) => {
  const clean: Record<string, any> = { ...(data ?? {}) };
  for (const field of QUOTE_VIRTUAL_FIELDS) {
    delete clean[field];
  }
  if (!keepVersionFields) {
    for (const field of QUOTE_VERSION_FIELDS) {
      delete clean[field];
    }
  }
  return clean;
};

/**
 * Writes `valid_until` / `terms` onto the quote's draft version.
 *
 * Only what actually changed is sent, and only to a version that is still a
 * draft: an issued version is immutable forever (`quote_version_frozen`), and
 * silently trying to edit one would turn a header save into a failure the user
 * cannot act on. A quote that has no draft open — every version issued — simply
 * has nothing to write, which is the same thing the editor shows.
 */
export const updateDraftVersionFields = async (
  baseDataProvider: DataProvider,
  quoteId: Identifier,
  data: Record<string, any> | undefined,
  previousData: Record<string, any> | undefined,
) => {
  const changed: Record<string, any> = {};
  for (const field of QUOTE_VERSION_FIELDS) {
    if (
      data != null &&
      field in data &&
      data[field] !== previousData?.[field]
    ) {
      changed[field] = data[field];
    }
  }
  if (Object.keys(changed).length === 0) return;

  const { data: versions } = await baseDataProvider.getList<QuoteVersion>(
    "quote_versions",
    {
      filter: { quote_id: quoteId },
      sort: { field: "version_number", order: "DESC" },
      pagination: { page: 1, perPage: 1 },
    },
  );

  const draft = versions?.[0];
  if (!draft || draft.issued_at != null) return;

  await baseDataProvider.update("quote_versions", {
    id: draft.id,
    data: changed,
    previousData: draft,
  });
};
