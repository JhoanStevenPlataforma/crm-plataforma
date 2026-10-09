/**
 * The layout a customer receives, for the compose dialog's preview.
 *
 * Re-exported from the dispatcher's own module rather than rewritten: a
 * preview drawn by other code would be a picture of a different message
 * (docs/proposals/outbound-email.md). That module is pure and imports nothing.
 */
export {
  QUOTE_LINK_MARKER,
  emailLanguage,
  formatEmailDate,
  renderEmail,
} from "../../../../supabase/functions/_shared/email/renderEmail.ts";
export type { EmailQuoteSummary } from "../../../../supabase/functions/_shared/email/renderEmail.ts";
