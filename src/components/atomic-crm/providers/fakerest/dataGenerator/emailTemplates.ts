import type { EmailSettings, EmailTemplate } from "../../../types";

/**
 * The email templates, seeded exactly as the migration seeds them
 * (`20261008120000_outbound_email.sql`): the quotation message in the two
 * languages the CRM is run in. Keep the two identical.
 */
export const DEMO_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 1,
    key: "quote_share",
    name: "Envío de cotización",
    subject: "Cotización {{quote_number}} de {{issuer_name}}",
    body: [
      "Estimado/a {{customer_name}}:",
      "Le compartimos la cotización {{quote_number}}, emitida el {{issue_date}}, por un total de {{total}} {{currency}}.",
      "Puede consultarla, comentarla y responderla en el siguiente enlace:\n{{quote_link}}",
      "Quedamos atentos a cualquier inquietud.",
      "{{sender_name}}\n{{issuer_name}}",
    ].join("\n\n"),
    scope: "quote",
    category: "transactional",
    language: "es",
    is_active: true,
    is_system: true,
  },
  {
    id: 2,
    key: "quote_share",
    name: "Quotation delivery",
    subject: "Quotation {{quote_number}} from {{issuer_name}}",
    body: [
      "Dear {{customer_name}},",
      "Please find quotation {{quote_number}}, issued on {{issue_date}}, for a total of {{total}} {{currency}}.",
      "You can review it, comment on it and answer it here:\n{{quote_link}}",
      "We remain at your disposal for any question.",
      "{{sender_name}}\n{{issuer_name}}",
    ].join("\n\n"),
    scope: "quote",
    category: "transactional",
    language: "en",
    is_active: true,
    is_system: true,
  },
];

/**
 * The one settings row, as the migration writes it: the simulated provider.
 * A demo tab has no other.
 */
export const DEMO_EMAIL_SETTINGS: EmailSettings = {
  id: 1,
  provider_key: "mock",
  is_enabled: true,
  from_email: null,
  from_name: null,
  reply_to_mode: "sender",
  transactional_stream: "outbound",
  commercial_stream: "broadcast",
  credentials_secret_id: null,
  webhook_secret_id: null,
  max_per_user_hour: 60,
  max_per_recipient_day: 5,
};
