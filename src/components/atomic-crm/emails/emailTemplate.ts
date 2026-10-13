import type {
  EmailEntityType,
  EmailLanguage,
  EmailMessage,
  EmailTemplate,
} from "../types";
import {
  fillTemplate,
  QUOTE_LINK_VARIABLE,
  VARIABLE_PATTERN,
} from "../../../../supabase/functions/_shared/email/fillTemplate.ts";

/**
 * Templates in the compose dialog (docs/proposals/outbound-email.md).
 *
 * The fill itself is the dispatcher's own module, re-exported rather than
 * rewritten: an automatic message and a hand-written one must format a total
 * and a date identically. Here a variable with no value becomes nothing for
 * the user to see and fix, instead of braces the server would refuse.
 */
export { fillTemplate } from "../../../../supabase/functions/_shared/email/fillTemplate.ts";
export type { EmailVariables } from "../../../../supabase/functions/_shared/email/fillTemplate.ts";

const QUOTE_LINK = QUOTE_LINK_VARIABLE;

/**
 * What a message says, for somebody reading it in the CRM.
 *
 * A person's message is stored as it was written. An automation's is stored as
 * its TEMPLATE with the variables beside it -- the dispatcher fills it while
 * sending -- so every screen that shows one fills it the same way, with the
 * same function, instead of showing the team a row of braces.
 */
export const emailMessageText = (
  message: Pick<EmailMessage, "subject"> &
    Partial<
      Pick<EmailMessage, "origin" | "body_text" | "variables" | "language">
    >,
): { subject: string; body: string } => {
  const body = message.body_text ?? "";
  if (message.origin !== "automation") {
    return { subject: message.subject, body };
  }
  const language = asEmailLanguage(message.language);
  const variables = message.variables ?? {};
  return {
    subject: fillTemplate(message.subject, variables, language),
    body: fillTemplate(body, variables, language),
  };
};

/** Variables still in the text that the server would refuse. */
export const unresolvedVariables = (
  subject: string,
  body: string,
  isQuote: boolean,
): string[] => {
  const inSubject = [...subject.matchAll(VARIABLE_PATTERN)].map((m) => m[1]);
  const inBody = [...body.matchAll(VARIABLE_PATTERN)]
    .map((m) => m[1])
    .filter((name) => name !== QUOTE_LINK || !isQuote);
  return [...new Set([...inSubject, ...inBody])];
};

/** The templates a record may use: its own scope, and the generic ones. */
export const templatesFor = (
  templates: EmailTemplate[],
  entityType: EmailEntityType | null,
): EmailTemplate[] =>
  templates.filter(
    (template) =>
      template.is_active &&
      (template.scope === "generic" || template.scope === entityType),
  );

/** The system template a person shares a quotation with. */
const QUOTE_SHARE_KEY = "quote_share";

/**
 * The template the dialog opens with: for a quotation, the one written for
 * sharing it, in the user's language when it exists. By KEY: the templates
 * the automations send are quotation templates too, and a dialog that opened
 * on "acceptance confirmation" would be offering the wrong message.
 */
export const defaultTemplate = (
  templates: EmailTemplate[],
  entityType: EmailEntityType | null,
  language: EmailLanguage,
): EmailTemplate | undefined => {
  if (entityType !== "quote") return undefined;
  const own = templates.filter(
    (template) =>
      template.scope === "quote" && template.key === QUOTE_SHARE_KEY,
  );
  return own.find((template) => template.language === language) ?? own[0];
};

export const asEmailLanguage = (locale: string | undefined): EmailLanguage =>
  locale === "en" || locale === "fr" ? locale : "es";
