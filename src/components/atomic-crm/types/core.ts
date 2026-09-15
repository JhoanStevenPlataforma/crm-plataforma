/**
 * Users, roles and the primitives every other module builds on.
 *
 * Split out of the old single `types.ts`, which had grown past 900 lines and was
 * imported by roughly every file in the app: a change to a task field forced a
 * re-check of everything that touched a contact.
 */

import type { RaRecord } from "ra-core";
import type { ComponentType } from "react";

export type SignUpData = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

/**
 * Access level of a CRM user.
 *
 * - `admin`: full access, manages users and application configuration
 * - `manager`: sales manager — sees and reassigns every record, no user admin
 * - `rep`: sales representative — only sees and edits the records they own
 */
export type CrmRole = "admin" | "manager" | "rep";

export const CRM_ROLES: CrmRole[] = ["admin", "manager", "rep"];

export type SalesFormData = {
  avatar?: string;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  role: CrmRole;
  disabled: boolean;
};

export type Sale = {
  first_name: string;
  last_name: string;
  role: CrmRole;
  avatar?: RAFile;
  disabled?: boolean;
  user_id: string;

  /**
   * This is a copy of the user's email, to make it easier to handle by react admin
   * DO NOT UPDATE this field directly, it should be updated by the backend
   */
  email: string;

  /**
   * This is used by the fake rest provider to store the password
   * DO NOT USE this field in your code besides the fake rest provider
   * @deprecated
   */
  password?: string;
} & Pick<RaRecord, "id">;

export interface RAFile {
  src: string;
  title: string;
  path?: string;
  rawFile: File;
  type?: string;
}

export type AttachmentNote = RAFile;

export interface LabeledValue {
  value: string;
  label: string;
}

/**
 * A pipeline stage, as configured by the application.
 *
 * `probability` is the share of a deal's amount that counts towards a weighted
 * forecast, 0..1. It lived as a hardcoded literal inside `DealsChart.tsx` until
 * the analytics module needed the same numbers -- a business rule buried in a
 * chart component is one nobody can tune without a deploy, and two copies of it
 * are two forecasts.
 *
 * Optional: a stage with no probability is excluded from the weighted figure
 * rather than counted at zero or at one, because "nobody has said how likely
 * this stage is" and "this stage never closes" are different statements.
 */
export interface DealStage extends LabeledValue {
  probability?: number;
}

export interface NoteStatus extends LabeledValue {
  color: string;
}

export interface ContactGender {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}
