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
  if (role === "admin") {
    return true;
  }

  // Only admins manage users and application configuration. Managers still
  // resolve sales names through ReferenceField/ReferenceInput, which query the
  // data provider directly and do not go through canAccess.
  if (params.resource === "sales" || params.resource === "configuration") {
    return false;
  }

  // Handing a lead, contact, company or deal over to another rep is a sales
  // manager privilege.
  if (params.action === ASSIGN_ACTION) {
    return role === "manager";
  }

  return true;
};
