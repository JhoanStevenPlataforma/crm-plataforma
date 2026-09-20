/**
 * Quotations: the header, its versions and the lines that are the document
 * (docs/proposals/quotes-cpq-module.md §2.3–§2.4; the writable columns are in
 * §13.2 and the read views in §13.3).
 *
 * The rule the shapes below encode: the catalogue is CURRENT information and a
 * quote is a HISTORICAL SNAPSHOT. `QuoteLine` therefore carries `sku`, `name`,
 * `unit`, `unit_price` and `tax_rate_percent` as its own columns rather than
 * resolving them through `product_id`, which is provenance only.
 */

import type { Identifier } from "ra-core";

/** `public.quote_statuses.key`, as seeded by the Phase 2 migration. */
export type QuoteStatusKey =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "viewed"
  | "under_review"
  | "negotiating"
  | "accepted"
  | "rejected"
  | "expired"
  | "canceled";

/**
 * The reasons a refusal can carry (`quote_versions.rejected_reason_code`), in
 * the order the portal's form offers them.
 *
 * Here rather than beside the form that collects them: the list is the check
 * constraint's, `quote_portal_reject()` restates it to refuse a bad code with a
 * key the portal can explain, and BOTH sides now read it — the customer picks
 * one, the CRM labels it on the quotation and groups the pipeline by it.
 */
export const QUOTE_REJECTION_REASONS = [
  "price",
  "terms",
  "delivery_time",
  "product",
  "other",
] as const;

export type QuoteRejectionReason = (typeof QUOTE_REJECTION_REASONS)[number];

export type QuoteStatus = {
  id: Identifier;
  key: QuoteStatusKey;
  label: string;
  color: string;
  rank: number;
  is_open: boolean;
  is_terminal: boolean;
  counts_as_won: boolean;
  is_system: boolean;
};

/**
 * The header. `status_key`, `quote_number` and the totals are server-owned:
 * the status moves only through `transition_quote()`, and `valid_until` /
 * `terms` are a mirror of the current version after the insert that seeded it
 * (§13.2).
 */
export type Quote = {
  id: Identifier;
  quote_number: string;
  title?: string | null;
  deal_id?: Identifier | null;
  company_id: Identifier;
  contact_id?: Identifier | null;
  sales_id: Identifier;
  price_list_id?: Identifier | null;
  currency: string;
  status_key: QuoteStatusKey;
  valid_until?: string | null;
  terms?: string | null;
  internal_notes?: string | null;
  created_by?: Identifier | null;
  created_at?: string;
  updated_at?: string;
};

/**
 * What `quotes_summary` adds to the header: the names a list renders, the
 * status badge, the current version with its totals, and the counters (§13.3).
 */
export type QuoteSummary = Quote & {
  company_name?: string | null;
  deal_name?: string | null;
  owner_name?: string | null;
  status_label?: string | null;
  status_color?: string | null;
  status_is_open?: boolean | null;
  status_is_terminal?: boolean | null;
  status_counts_as_won?: boolean | null;
  current_version_id?: Identifier | null;
  current_version_number?: number | null;
  issued_at?: string | null;
  subtotal?: number | null;
  discount_total?: number | null;
  tax_total?: number | null;
  total?: number | null;
  accepted_at?: string | null;
  party_snapshot?: Record<string, unknown> | null;
  nb_issued_versions?: number | null;
  nb_lines?: number | null;
  nb_shared_comments?: number | null;
  nb_unanswered_customer_comments?: number | null;
  nb_views?: number | null;
  last_portal_activity_at?: string | null;
  nb_active_tokens?: number | null;
  /** The current version's answer, when it was a refusal (§6.4). */
  rejected_at?: string | null;
  rejected_reason_code?: QuoteRejectionReason | null;
};

/**
 * A document. `issued_at is null` means this is the working draft and the only
 * version anything may write to; anything else is frozen forever (§4).
 *
 * A client may write `valid_until`, `terms` and `discount_percent`, and only on
 * the draft. Everything below them is the server's.
 */
export type QuoteVersion = {
  id: Identifier;
  quote_id: Identifier;
  currency: string;
  version_number: number;
  issued_at?: string | null;
  issued_by?: Identifier | null;
  superseded_at?: string | null;
  valid_until?: string | null;
  terms?: string | null;
  party_snapshot?: Record<string, unknown> | null;
  /** A record of intent only: the discount that applies is on each line. */
  discount_percent?: number | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  /**
   * The answer, and the evidence of it (§6.4). Every column below is written
   * by `quote_portal_accept()` / `quote_portal_reject()` alone, through the
   * per-version unfreeze hole; a client may never write one.
   */
  accepted_at?: string | null;
  accepted_by_name?: string | null;
  accepted_by_email?: string | null;
  accepted_ip?: string | null;
  acceptance_method?: QuoteAcceptanceMethod | null;
  /** The version, the figure and the browser as they stood at the click. */
  acceptance_evidence?: QuoteAcceptanceEvidence | null;
  rejected_at?: string | null;
  rejected_reason?: string | null;
  rejected_reason_code?: QuoteRejectionReason | null;
  created_at?: string;
};

/** `quote_versions.acceptance_method`. Only the first is built (§6.4). */
export type QuoteAcceptanceMethod =
  | "portal_click"
  | "otp_email"
  | "esign"
  | "offline";

/**
 * `quote_versions.acceptance_evidence`, as `quote_portal_accept()` builds it.
 *
 * Every field is optional to READ: the column is `jsonb`, an older row or one
 * written by a future acceptance method may hold another shape, and a panel
 * that throws on an unexpected key would lose the evidence it exists to show.
 */
export type QuoteAcceptanceEvidence = {
  token_id?: number | null;
  version_number?: number | null;
  currency?: string | null;
  total?: number | string | null;
  user_agent?: string | null;
};

/**
 * One line of the document.
 *
 * The four `line_*` columns are generated and STORED: PostgreSQL refuses any
 * value for them, including the unchanged one a form would post back, so they
 * are never sent. `quoteMath.ts` recomputes the same arithmetic for the editor,
 * digit for digit.
 */
export type QuoteLine = {
  id: Identifier;
  version_id: Identifier;
  quote_id: Identifier;
  /** Provenance only. The frozen columns below ARE the record. */
  product_id?: Identifier | null;
  sku?: string | null;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_rate_id?: Identifier | null;
  tax_rate_percent: number;
  position: number;
  line_gross?: number;
  line_discount?: number;
  line_tax?: number;
  line_total?: number;
};

/** A row of `price_book`: what the line picker offers (§13.3). */
export type PriceBookEntry = {
  /** The text key `price_list_id:product_id:min_quantity`. */
  id: string;
  price_list_id: Identifier;
  price_list_code: string;
  price_list_name: string;
  currency: string;
  product_id: Identifier;
  sku: string;
  name: string;
  description?: string | null;
  kind: string;
  category?: string | null;
  unit: string;
  unit_price: number;
  /** True when the price comes from the list rather than the product itself. */
  is_list_price: boolean;
  min_quantity: number;
  tax_rate_id?: Identifier | null;
  tax_rate_code?: string | null;
  tax_rate_percent?: number | null;
};

/**
 * A legal edge of the status machine, read as data (§3).
 *
 * The graph lives in `quote_transitions` rather than in an `if`, for the two
 * reasons `deal_stage_requirements` gives: a graph that needs a migration to
 * change is one nobody tunes, and a function full of literal status names is
 * wrong for the first customer who renames one. The toolbar therefore READS
 * this table instead of hard-coding which buttons a status offers.
 *
 * `allowed_actor` is the security piece: `viewed`, `accepted` and `rejected`
 * belong to the customer on the portal, `expired` to the sweeper. An internal
 * screen offers only the `internal` edges.
 */
export type QuoteTransition = {
  id: Identifier;
  from_status_key: QuoteStatusKey;
  to_status_key: QuoteStatusKey;
  label?: string | null;
  requires_reason: boolean;
  requires_issued_version: boolean;
  allowed_actor: "internal" | "customer" | "system" | "any";
  is_system: boolean;
};

/**
 * What `quote_discount_gate()` answers (§3.1, §13.4).
 *
 * `max_allowed: null` with `ok: true` is "no rule applies", which is a
 * different fact from "the rule is satisfied" — only one of the two means the
 * control is working, and the dialog says which.
 *
 * `reason_required` is reported rather than recomputed here: it is true inside
 * the ceiling but above `requires_reason_above`, UNLESS the quote's latest
 * approval already carries a written reason. A second implementation of that
 * condition is exactly how a dialog ends up asking for a motive the server does
 * not want, or skipping one it does.
 */
export type QuoteDiscountGate = {
  quote_id: Identifier;
  role: string | null;
  approved_by_role?: string | null;
  max_allowed: number | null;
  effective_discount_percent: number;
  ok: boolean;
  reason_required: boolean;
  requires_reason_above: number | null;
  since: string | null;
  offending_line_ids: Identifier[];
};

/**
 * What issuing a version and minting another link both return.
 *
 * `token` is the raw token and it exists exactly once, in this response: the
 * database stores only its sha256. A caller that does not build the link
 * immediately cannot ask for it again — it has to mint a new one.
 */
export type QuoteLink = {
  quote_id: Identifier;
  version_id: Identifier;
  version_number: number;
  token_id: Identifier;
  token: string;
  expires_at: string;
};

/**
 * A row of `quote_access_tokens_summary`: the token columns WITHOUT
 * `token_hash`, which is why the underlying table is unreadable to everybody
 * (§13.3). `is_active` folds revocation and expiry into the one fact a screen
 * needs.
 */
export type QuoteAccessToken = {
  id: Identifier;
  quote_id: Identifier;
  version_id: Identifier;
  label?: string | null;
  created_by?: Identifier | null;
  created_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  revoked_by?: Identifier | null;
  last_seen_at?: string | null;
  view_count: number;
  is_active: boolean;
};

/**
 * One act on the customer's page (§5). Append-only for everybody: the portal
 * functions write these rows as the service role and nothing revises them.
 *
 * `actor_name` / `actor_email` are what the customer TYPED, not an identity —
 * the portal has no session, by design — and `ip_address` is evidence rather
 * than authentication (§13.6 #15).
 */
export type QuotePortalEvent = {
  id: Identifier;
  quote_id: Identifier;
  version_id?: Identifier | null;
  token_id?: Identifier | null;
  event_type:
    | "viewed"
    | "downloaded"
    | "commented"
    | "accepted"
    | "rejected"
    | "throttled"
    | "token_invalid";
  occurred_at: string;
  ip_address?: string | null;
  user_agent?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  payload?: Record<string, unknown> | null;
};

/**
 * One message of the negotiation thread (§2.5, Phase 8).
 *
 * A client writes `quote_id`, `body`, `visibility` and, for a reply,
 * `parent_id` — and only ever an INTERNAL comment: a customer's arrives through
 * the portal. The author, the currency, the dates and the read mark are the
 * server's (`quote_comments_before_insert`). Afterwards the author may change
 * the body (stamped `edited_at`) or set `deleted_at` (a soft delete, stamped);
 * the audience is fixed at creation, and a customer comment is changed only by
 * `mark_quote_comments_read()`.
 */
export type QuoteComment = {
  id: Identifier;
  quote_id: Identifier;
  currency?: string;
  /** The version the customer's link opened; null for the quote as a whole. */
  version_id?: Identifier | null;
  /** Always a root: a reply to a reply is re-parented by the server. */
  parent_id?: Identifier | null;
  author_sales_id?: Identifier | null;
  author_kind: "internal" | "customer";
  /** A customer's signature. Null on an internal comment. */
  author_name?: string | null;
  author_email?: string | null;
  visibility: "internal" | "shared";
  body: string;
  read_by_internal_at?: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
};

/** One move of the status machine, as `quote_status_changes` records it (§5). */
export type QuoteStatusChange = {
  id: Identifier;
  quote_id: Identifier;
  from_status?: QuoteStatusKey | null;
  to_status: QuoteStatusKey;
  reason?: string | null;
  sales_id?: Identifier | null;
  actor_kind: "internal" | "customer" | "system";
  changed_at: string;
  override_reason?: string | null;
  seq: number;
};

/**
 * A discount ceiling, keyed on the role it applies to (§3.1).
 *
 * `role` IS the primary key: there is no `id` column in the database, and the
 * optional one below exists only because FakeRest keys every record on `id`.
 */
export type QuoteDiscountRule = {
  id?: Identifier;
  role: string;
  max_discount_percent: number;
  requires_reason_above?: number | null;
  /** Null means the rule is not switched on. */
  enforced_from?: string | null;
  updated_at?: string;
};
