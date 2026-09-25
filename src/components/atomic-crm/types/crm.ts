/**
 * The original CRM entities: companies, contacts, deals, leads and their notes.
 */

import type { Identifier, RaRecord } from "ra-core";

import type { AttachmentNote, RAFile } from "./core";

export type Company = {
  name: string;
  logo: RAFile;
  sector: string;
  size: 1 | 10 | 50 | 250 | 500;
  linkedin_url: string;
  website: string;
  phone_number: string;
  address: string;
  zipcode: string;
  city: string;
  state_abbr: string;
  sales_id?: Identifier;
  created_at: string;
  description: string;
  revenue: string;
  tax_identifier: string;
  country: string;
  context_links?: string[];
  nb_contacts?: number;
  nb_deals?: number;
} & Pick<RaRecord, "id">;

export type EmailAndType = {
  email: string;
  type: "Work" | "Home" | "Other";
};

export type PhoneNumberAndType = {
  number: string;
  type: "Work" | "Home" | "Other";
};

export type Contact = {
  first_name: string;
  last_name: string;
  title: string;
  company_id?: Identifier | null;
  email_jsonb: EmailAndType[];
  avatar?: Partial<RAFile>;
  linkedin_url?: string | null;
  first_seen: string;
  last_seen: string;
  has_newsletter: boolean;
  tags: number[];
  gender: string;
  sales_id?: Identifier;
  status: string;
  background: string;
  phone_jsonb: PhoneNumberAndType[];
  nb_tasks?: number;
  company_name?: string;
} & Pick<RaRecord, "id">;

export type ContactNote = {
  contact_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  status: string;
  attachments?: AttachmentNote[];
} & Pick<RaRecord, "id">;

export type Deal = {
  name: string;
  company_id: Identifier;
  contact_ids: Identifier[];
  category: string;
  stage: string;
  description: string;
  amount: number;
  /**
   * The quotation whose total the amount is (`sync_deal_from_quote()`); null
   * when a person typed it.
   */
  amount_source_quote_id?: Identifier | null;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  expected_closing_date: string;
  sales_id: Identifier;
  index: number;
  /** Which team the deal counts for in the budget dashboard. */
  team_id?: Identifier | null;
} & Pick<RaRecord, "id">;

export type DealNote = {
  deal_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  attachments?: AttachmentNote[];

  // This is defined for compatibility with `ContactNote`
  status?: undefined;
} & Pick<RaRecord, "id">;

/**
 * One row of `public.deal_stage_changes`: why a deal moved to a stage.
 *
 * Read-only from the client. The row is written by the `deals_log_stage_change`
 * trigger on any path that changes `deals.stage`, and `move_deal_stage()` is
 * what puts the reason and the files on it — so an undocumented move still
 * appears in the history, with a null `reason`.
 */
export type DealStageChange = {
  deal_id: Identifier;
  /** Null for the first recorded transition of a deal. */
  from_stage?: string | null;
  to_stage: string;
  reason?: string | null;
  /** Who moved it, resolved server-side from the session. */
  sales_id?: Identifier | null;
  changed_at: string;
  attachments?: AttachmentNote[];
  /**
   * Why an admin was allowed to move the deal without meeting the completed
   * task requirement. Null on every move that met it.
   */
  override_reason?: string | null;
  /** `quote`: moved by a quotation's event (`sync_deal_from_quote()`). */
  source?: "manual" | "quote";
  /** The quotation whose event moved it, when `source` is `quote`. */
  quote_id?: Identifier | null;
} & Pick<RaRecord, "id">;

/**
 * What `public.deal_stage_gate()` answers: has this deal earned the stage it is
 * being dragged into?
 *
 * The same function backs the enforcement inside `move_deal_stage()`, so what
 * the dialog displays and what the server will do are one decision, not two.
 *
 * `required` is 0 when no rule applies to the target stage at all, which is why
 * it is reported separately from `ok` — "nothing to satisfy" and "satisfied"
 * read the same on a boolean.
 */
export type DealStageGate = {
  deal_id: Identifier;
  to_stage: string;
  required: number;
  completed: number;
  ok: boolean;
  /** When the deal entered the stage it is leaving. The counting window opens here. */
  since: string;
  qualifying_task_ids: Identifier[];
};

/**
 * An unqualified prospect, before it becomes a company + contact.
 *
 * `company_name` is free text rather than a `company_id`: a lead typically
 * arrives from a web form naming a company the CRM has never heard of. The
 * `converted_*` fields record what `convert_lead()` produced.
 */
export type Lead = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  /** Free text, as typed into a web form: the company may not exist yet. */
  company_name?: string;
  /** Set once the lead is recognised as belonging to a known company. */
  company_id?: Identifier | null;
  title?: string;
  source?: string;
  status: string;
  score?: number;
  notes?: string;
  tags?: number[];
  sales_id?: Identifier;
  created_at: string;
  updated_at: string;
  converted_at?: string | null;
  converted_contact_id?: Identifier | null;
  converted_company_id?: Identifier | null;
  converted_deal_id?: Identifier | null;
} & Pick<RaRecord, "id">;

export type Tag = {
  id: number;
  name: string;
  color: string;
};
