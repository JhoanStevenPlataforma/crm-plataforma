import type { Identifier, RaRecord } from "ra-core";

/**
 * Outbound email (docs/proposals/outbound-email.md): mail the CRM sends to a
 * customer, and the record of it.
 */

/**
 * `accepted` is the provider's API taking the message, `delivered` is its
 * webhook confirming the mailbox did; `simulated` is the development provider,
 * which sends nothing. A screen must never show one as another.
 */
export type EmailStatus =
  | "pending"
  | "processing"
  | "accepted"
  | "delivered"
  | "bounced"
  | "failed"
  | "canceled"
  | "simulated";

/** The records a message can be written from. */
export type EmailEntityType = "contact" | "lead" | "company" | "deal" | "quote";

export type EmailLanguage = "es" | "en" | "fr";
export type EmailCategory = "transactional" | "commercial";

export type EmailMessage = {
  created_at: string;
  sales_id: Identifier | null;
  origin: "manual" | "automation" | "test";
  category: EmailCategory;
  language: EmailLanguage;
  to_email: string;
  to_name: string | null;
  contact_id: Identifier | null;
  subject: string;
  body_text: string;
  template_id: Identifier | null;
  template_key: string | null;
  /** The figures frozen with the message. Never the customer link. */
  variables: Record<string, string | number | null>;
  entity_type: EmailEntityType | null;
  entity_id: Identifier | null;
  quote_id: Identifier | null;
  quote_version_id: Identifier | null;
  status: EmailStatus;
  attempt: number;
  provider_key: string | null;
  provider_message_id: string | null;
  error_code: string | null;
  error: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  failed_at: string | null;
} & Pick<RaRecord, "id">;

export type EmailTemplate = {
  key: string;
  name: string;
  subject: string;
  body: string;
  scope: "generic" | EmailEntityType;
  category: EmailCategory;
  language: EmailLanguage;
  is_active: boolean;
  is_system: boolean;
} & Pick<RaRecord, "id">;

/** The administrators' row. Holds no secret: only whether one exists. */
export type EmailSettings = {
  provider_key: "mock" | "postmark";
  is_enabled: boolean;
  from_email: string | null;
  from_name: string | null;
  reply_to_mode: "sender" | "none";
  transactional_stream: string;
  commercial_stream: string;
  credentials_secret_id: string | null;
  webhook_secret_id: string | null;
  max_per_user_hour: number;
  max_per_recipient_day: number;
} & Pick<RaRecord, "id">;

/** `email_status()`: what every signed-in user may know about the service. */
export type EmailServiceStatus = {
  is_enabled: boolean;
  provider_key: string;
  /** True when nothing leaves: the simulated provider is in use. */
  is_simulated: boolean;
  is_ready: boolean;
  from_email: string | null;
  from_name: string | null;
  has_credentials: boolean;
  has_webhook_secret: boolean;
  /** May type an address that is not related to the record. */
  can_send_any: boolean;
};

export type EmailRecipient = {
  email: string;
  name: string | null;
  contact_id: Identifier | null;
  /** On the suppression list: it bounced for good, or reported us as spam. */
  is_suppressed?: boolean;
};

/** What the provider reported about a message after accepting it. */
export type EmailMessageEvent = {
  message_id: Identifier | null;
  provider_key: string;
  provider_event_id: string;
  event_type: "delivered" | "bounced" | "complained";
  is_permanent: boolean;
  recipient: string | null;
  occurred_at: string;
  detail: string | null;
} & Pick<RaRecord, "id">;

/** An address the CRM will not write to. Keyed by the address itself. */
export type EmailSuppression = {
  /** The address: this table's primary key. */
  id: string;
  email: string;
  reason: "hard_bounce" | "complaint" | "manual";
  detail: string | null;
  source_message_id: Identifier | null;
  created_at: string;
  created_by: Identifier | null;
};

/** Why the newest issued version cannot be shared, as the server names it. */
export type EmailQuoteBlock =
  | "quote_not_found"
  | "quote_not_issued"
  | "version_superseded"
  | "version_answered"
  | "quote_closed"
  | "quote_revision_open"
  | "version_expired";

/** `email_context()`: everything the compose dialog needs about one record. */
export type EmailContext = {
  status: EmailServiceStatus;
  recipients: EmailRecipient[];
  variables: Record<string, string | number | null>;
  allowed_variables: string[];
  quote: {
    version_id: Identifier | null;
    version_number: number | null;
    block: EmailQuoteBlock | null;
  } | null;
};

export type SendEmailInput = {
  /** Null for the administrator's test message. */
  entityType: EmailEntityType | null;
  entityId: Identifier | null;
  /** Required for a quotation: the issued version being shared. */
  quoteVersionId?: Identifier | null;
  toEmail: string;
  toName?: string | null;
  subject: string;
  body: string;
  templateId?: Identifier | null;
  language?: EmailLanguage;
  /** One per press of "Send": repeating the call returns the same message. */
  idempotencyKey: string;
  confirmDuplicate?: boolean;
};
