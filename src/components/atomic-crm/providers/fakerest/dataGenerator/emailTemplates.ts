import type {
  EmailAutomation,
  EmailSettings,
  EmailTemplate,
} from "../../../types";

/**
 * The email templates, seeded exactly as the migrations seed them
 * (`20261008120000_outbound_email.sql`, and the two the automations send in
 * `20261010120000_outbound_email_automations.sql`), in the two languages the
 * CRM is run in. Keep them identical.
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
  {
    id: 3,
    key: "quote_accepted",
    name: "Confirmación de aceptación",
    subject: "Confirmación de aceptación: cotización {{quote_number}}",
    body: [
      "Estimado/a {{customer_name}}:",
      "Hemos recibido su aceptación de la cotización {{quote_number}}, por un total de {{total}} {{currency}}. Gracias por su confianza.",
      "Puede consultar el documento aceptado en el siguiente enlace:\n{{quote_link}}",
      "Nos pondremos en contacto para coordinar los siguientes pasos.",
      "{{sender_name}}\n{{issuer_name}}",
    ].join("\n\n"),
    scope: "quote",
    category: "transactional",
    language: "es",
    is_active: true,
    is_system: true,
  },
  {
    id: 4,
    key: "quote_accepted",
    name: "Acceptance confirmation",
    subject: "Acceptance confirmed: quotation {{quote_number}}",
    body: [
      "Dear {{customer_name}},",
      "We have received your acceptance of quotation {{quote_number}}, for a total of {{total}} {{currency}}. Thank you for your trust.",
      "You can review the accepted document here:\n{{quote_link}}",
      "We will be in touch to arrange the next steps.",
      "{{sender_name}}\n{{issuer_name}}",
    ].join("\n\n"),
    scope: "quote",
    category: "transactional",
    language: "en",
    is_active: true,
    is_system: true,
  },
  {
    id: 5,
    key: "quote_followup",
    name: "Seguimiento de cotización",
    subject: "Recordatorio: cotización {{quote_number}} de {{issuer_name}}",
    body: [
      "Estimado/a {{customer_name}}:",
      "Le escribimos para dar seguimiento a la cotización {{quote_number}}, emitida el {{issue_date}}, por un total de {{total}} {{currency}}.",
      "Puede consultarla y responderla en el siguiente enlace:\n{{quote_link}}",
      "Quedamos atentos a cualquier inquietud.",
      "{{sender_name}}\n{{issuer_name}}",
    ].join("\n\n"),
    scope: "quote",
    category: "commercial",
    language: "es",
    is_active: true,
    is_system: true,
  },
  {
    id: 6,
    key: "quote_followup",
    name: "Quotation follow-up",
    subject: "Reminder: quotation {{quote_number}} from {{issuer_name}}",
    body: [
      "Dear {{customer_name}},",
      "We are following up on quotation {{quote_number}}, issued on {{issue_date}}, for a total of {{total}} {{currency}}.",
      "You can review it and answer it here:\n{{quote_link}}",
      "We remain at your disposal for any question.",
      "{{sender_name}}\n{{issuer_name}}",
    ].join("\n\n"),
    scope: "quote",
    category: "commercial",
    language: "en",
    is_active: true,
    is_system: true,
  },
];

/**
 * The two rules, as the migration seeds them: switched OFF. Nothing is sent
 * automatically until an administrator enables one.
 */
export const DEMO_EMAIL_AUTOMATIONS: EmailAutomation[] = [
  {
    id: "quote_accepted",
    key: "quote_accepted",
    state: "disabled",
    template_key: "quote_accepted",
    delay_days: null,
    max_sends: 1,
    updated_at: "2026-10-10T12:00:00.000Z",
    updated_by: null,
  },
  {
    id: "quote_followup",
    key: "quote_followup",
    state: "disabled",
    template_key: "quote_followup",
    delay_days: 5,
    max_sends: 1,
    updated_at: "2026-10-10T12:00:00.000Z",
    updated_by: null,
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
