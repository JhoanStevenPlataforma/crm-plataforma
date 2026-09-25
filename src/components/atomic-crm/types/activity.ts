/**
 * What happened, and when: the dashboard activity feed and the unified
 * timeline a contact, deal or task renders.
 */

import type { Identifier, RaRecord } from "ra-core";

import type {
  COMPANY_CREATED,
  CONTACT_CREATED,
  CONTACT_NOTE_CREATED,
  DEAL_CREATED,
  DEAL_NOTE_CREATED,
} from "../consts";
import type { Company, Contact, ContactNote, Deal, DealNote } from "./crm";
import type { TaskEntityType } from "./tasks";

/**
 * One row of `public.timeline_events` (§6.2) — the task event stream merged
 * with the surrounding note activity.
 *
 * `id` is a string (`task_event:918273`, `contact_note:44`) because the union
 * has no shared numeric key. Read-only: every branch is written elsewhere, and
 * the task branch is append-only.
 */
export type TimelineEvent = {
  id: string;
  occurred_at: string;
  event_type: string;
  source:
    | "task"
    | "contact_note"
    | "deal_note"
    | "deal_stage_change"
    | "quote_status_change"
    | "quote_portal_event";
  task_id?: Identifier | null;
  actor_sales_id?: Identifier | null;
  actor_kind: "user" | "system" | "automation" | "integration" | "import";
  entity_type?: TaskEntityType | null;
  entity_id?: Identifier | null;
  payload?: Record<string, unknown> | null;
};

export type ActivityCompanyCreated = {
  type: typeof COMPANY_CREATED;
  company_id: Identifier;
  company: Company;
  sales_id: Identifier;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactCreated = {
  type: typeof CONTACT_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  contact: Contact;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactNoteCreated = {
  type: typeof CONTACT_NOTE_CREATED;
  sales_id?: Identifier;
  contactNote: ContactNote;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityDealCreated = {
  type: typeof DEAL_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  deal: Deal;
  date: string;
};

export type ActivityDealNoteCreated = {
  type: typeof DEAL_NOTE_CREATED;
  sales_id?: Identifier;
  dealNote: DealNote;
  date: string;
};

export type Activity = RaRecord &
  (
    | ActivityCompanyCreated
    | ActivityContactCreated
    | ActivityContactNoteCreated
    | ActivityDealCreated
    | ActivityDealNoteCreated
  );
