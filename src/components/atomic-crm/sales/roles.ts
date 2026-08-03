import { CRM_ROLES, type CrmRole } from "../types";

/**
 * Role choices for `SelectInput`. The labels are i18n keys: `SelectInput`
 * translates choice names when the choices are passed directly.
 */
export const roleChoices: { id: CrmRole; name: string }[] = CRM_ROLES.map(
  (role) => ({ id: role, name: `resources.sales.roles.${role}` }),
);

/**
 * Roles that are highlighted in the users list. A plain rep is the default and
 * carries no badge.
 */
export const isPrivilegedRole = (role?: CrmRole): boolean =>
  role === "admin" || role === "manager";
