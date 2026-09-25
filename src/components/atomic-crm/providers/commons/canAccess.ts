import type { CrmRole } from "../../types";

// FIXME: This should be exported from the ra-core package
type CanAccessParams<
  RecordType extends Record<string, any> = Record<string, any>,
> = {
  action: string;
  resource: string;
  record?: RecordType;
};

/**
 * Reassigning the owner (`sales_id`) of a record. Not a built-in react-admin
 * action: it gates the bulk-assign button and the owner input.
 */
export const ASSIGN_ACTION = "assign";

/** The commercial catalogue quotes are priced from (quotes §2.1–§2.2). */
const CATALOGUE_RESOURCES = new Set([
  "products",
  "price_lists",
  "price_list_items",
  "tax_rates",
]);

/**
 * The status machine, as data (quotes §3). Everybody reads it — the list filter
 * and the status badge both do — and only an admin edits it, because the legal
 * moves of a commercial document are not a per-manager preference.
 */
const QUOTE_TUNABLE_RESOURCES = new Set([
  "quote_statuses",
  "quote_transitions",
]);

/**
 * Read-only projections. `price_book` and `quote_access_tokens_summary` are
 * views, so a write is not merely refused, it is impossible; offering a button
 * for one would be a lie.
 *
 * A link is withdrawn through `revoke_quote_token()` and a status moves through
 * `transition_quote()` — neither is a resource write, so neither is asked about
 * here. The status history reaches the UI through `timeline_events`, so
 * `quote_status_changes` is not a resource at all.
 */
const QUOTE_READONLY_RESOURCES = new Set([
  "price_book",
  "quote_access_tokens_summary",
]);

/**
 * UI-level access control.
 *
 * This is a usability layer only — it decides which menu entries, buttons and
 * inputs are rendered. The real boundary is the row level security in
 * `supabase/schemas/05_policies.sql`, which is enforced by Postgres and cannot
 * be bypassed from the browser. Never rely on this function alone to protect
 * data.
 */
export const canAccess = <
  RecordType extends Record<string, any> = Record<string, any>,
>(
  role: CrmRole,
  params: CanAccessParams<RecordType>,
) => {
  // A product has append-only catalogue history from the moment it exists, so
  // the database refuses to delete one for everybody, admins included (quotes
  // §13.2): a product that is no longer sold is deactivated. Checked before the
  // admin shortcut, or admins would be offered a button that can only fail.
  if (params.resource === "products" && params.action === "delete") {
    return false;
  }

  // A quote is never deleted, by anybody: there is no delete policy and no
  // DELETE privilege, so the database answers 42501 (quotes §13.2). A quote
  // ends as `canceled`, because a document a customer was shown is a
  // commercial record. Checked before the admin shortcut for the same reason
  // products are.
  if (params.resource === "quotes" && params.action === "delete") {
    return false;
  }

  // A version is created by `issue_quote_version()` / `revise_quote()` and
  // never by a client, and nothing removes one: the table has no insert and no
  // delete policy at all.
  if (
    params.resource === "quote_versions" &&
    (params.action === "create" || params.action === "delete")
  ) {
    return false;
  }

  if (QUOTE_READONLY_RESOURCES.has(params.resource)) {
    return params.action === "list" || params.action === "show";
  }

  if (role === "admin") {
    return true;
  }

  if (QUOTE_TUNABLE_RESOURCES.has(params.resource)) {
    return params.action === "list" || params.action === "show";
  }

  // The customer portal's slides are the company's voice, like the
  // configuration: everyone reads them, admins change them (portal §7).
  if (
    params.resource === "portal_slides" ||
    params.resource === "portal_templates"
  ) {
    return params.action === "list" || params.action === "show";
  }

  // Only admins manage users and application configuration. Managers still
  // resolve sales names through ReferenceField/ReferenceInput, which query the
  // data provider directly and do not go through canAccess.
  if (params.resource === "sales" || params.resource === "configuration") {
    return false;
  }

  // Teams decide who sees what through the task access rule (§7.3), so editing
  // one is an access-control change. Reading them stays open — a rep must be
  // able to see which team a task is assigned to.
  if (params.resource === "teams" || params.resource === "team_members") {
    return role === "manager" || params.action === "list";
  }

  // The catalogue is priced data: a rep quotes FROM it, a manager maintains it
  // (quotes §7). A rep able to write it could price their own deal.
  if (CATALOGUE_RESOURCES.has(params.resource)) {
    return (
      role === "manager" || params.action === "list" || params.action === "show"
    );
  }

  // Discount ceilings are tuned by admins alone (quotes §3.1): a manager able to
  // raise one would override the rule for the whole organisation, which is a
  // strictly larger power than the one-off override an admin has to write down.
  if (params.resource === "quote_discount_rules") {
    return params.action === "list" || params.action === "show";
  }

  // Handing a lead, contact, company or deal over to another rep is a sales
  // manager privilege.
  if (params.action === ASSIGN_ACTION) {
    return role === "manager";
  }

  return true;
};
