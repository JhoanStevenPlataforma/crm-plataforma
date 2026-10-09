import type { EmailEntityType, EmailLanguage, EmailTemplate } from "../types";
import { formatEmailDate } from "./emailRender";

/**
 * Filling a template for the compose dialog
 * (docs/proposals/outbound-email.md).
 *
 * `{{name}}` is the only syntax, the same one `email_text_variables()` reads.
 * The result is PLAIN TEXT the user goes on editing; the server escapes it
 * into the layout, so nothing here needs to.
 */

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const QUOTE_LINK = "quote_link";
const DATE_VARIABLES = new Set(["issue_date", "valid_until"]);
const LOCALES: Record<EmailLanguage, string> = {
  es: "es-CO",
  en: "en-US",
  fr: "fr-FR",
};

export type EmailVariables = Record<string, string | number | null | undefined>;

const display = (
  name: string,
  value: string | number | null | undefined,
  language: EmailLanguage,
): string => {
  if (value == null) return "";
  if (DATE_VARIABLES.has(name)) return formatEmailDate(String(value), language);
  // The stored total, formatted for reading. Never recomputed.
  if (name === "total" && Number.isFinite(Number(value))) {
    return new Intl.NumberFormat(LOCALES[language], {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  }
  return String(value);
};

/**
 * Replaces every variable the record has a value for. The quotation link is
 * left as its marker: only the server knows it, and it resolves it while
 * sending. A variable with no value becomes nothing, for the user to see and
 * fix, rather than staying as braces the server would refuse.
 */
export const fillTemplate = (
  text: string,
  variables: EmailVariables,
  language: EmailLanguage,
): string =>
  text.replace(VARIABLE_PATTERN, (marker, name: string) =>
    name === QUOTE_LINK ? marker : display(name, variables[name], language),
  );

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

/**
 * The template the dialog opens with: for a quotation, the one written for
 * sharing it, in the user's language when it exists.
 */
export const defaultTemplate = (
  templates: EmailTemplate[],
  entityType: EmailEntityType | null,
  language: EmailLanguage,
): EmailTemplate | undefined => {
  if (entityType !== "quote") return undefined;
  const own = templates.filter((template) => template.scope === "quote");
  return own.find((template) => template.language === language) ?? own[0];
};

export const asEmailLanguage = (locale: string | undefined): EmailLanguage =>
  locale === "en" || locale === "fr" ? locale : "es";
