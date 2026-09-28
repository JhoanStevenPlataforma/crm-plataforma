import type { Lead } from "../types";

export const LEAD_IDENTITY_REQUIRED =
  "resources.leads.validation.identity_required";

type LeadFields = Partial<
  Pick<
    Lead,
    | "first_name"
    | "last_name"
    | "email"
    | "phone"
    | "company_name"
    | "company_id"
  >
>;

const isFilled = (value: unknown) =>
  value != null && String(value).trim() !== "";

/**
 * A lead needs something to follow up on: a name, a way to reach them, or a
 * company. The same rule as `leads_has_identity` in the database, checked here
 * so the form explains it instead of the server refusing it.
 */
export const leadHasIdentity = (lead: LeadFields) =>
  [
    lead.first_name,
    lead.last_name,
    lead.email,
    lead.phone,
    lead.company_name,
    lead.company_id,
  ].some(isFilled);

/**
 * Converting creates a contact, and a contact needs a name, an email or a
 * phone (`contacts_has_identity`). A lead known only by its company cannot
 * become one yet.
 */
export const leadCanBecomeContact = (lead: LeadFields) =>
  [lead.first_name, lead.last_name, lead.email, lead.phone].some(isFilled);

/**
 * Field validator for the lead form's first name. It receives every value, so
 * it can enforce the whole-record rule while showing the message where the
 * user starts typing.
 */
export const validateLeadIdentity = (
  _value: unknown,
  values: Record<string, unknown>,
) =>
  leadHasIdentity(values as LeadFields) ? undefined : LEAD_IDENTITY_REQUIRED;
