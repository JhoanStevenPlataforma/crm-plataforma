/**
 * The message a customer receives: the user's plain text, escaped, inside the
 * branded layout -- and the same text as the plain-text part.
 *
 * Pure, with no import, because TWO callers must agree to the character: the
 * dispatcher that sends it and the compose dialog that previews it
 * (`src/components/atomic-crm/emails/emailRender.ts` re-exports this file).
 * A preview drawn by other code would be a picture of a different message.
 *
 * Nothing the user or a record supplies is ever written into the HTML
 * unescaped: there is no markup syntax, so there is nothing to sanitise and
 * nothing to inject.
 */

export const QUOTE_LINK_MARKER = "{{quote_link}}";
const QUOTE_LINK_PATTERN = /\{\{\s*quote_link\s*\}\}/g;

export type EmailLanguage = "es" | "en" | "fr";

/** The figures of the version being shared, as frozen at issue. */
export interface EmailQuoteSummary {
  quote_number?: string | null;
  quote_version?: number | string | null;
  issue_date?: string | null;
  valid_until?: string | null;
  total?: number | string | null;
  currency?: string | null;
}

export interface RenderEmailInput {
  bodyText: string;
  language?: string | null;
  issuerName?: string | null;
  logoUrl?: string | null;
  /**
   * The product's icon, drawn beside the issuer's name when there is no logo.
   * Build it with `emailIconUrl()`.
   */
  iconUrl?: string | null;
  /** The customer link. Absent for a message that shares no quotation. */
  quoteLink?: string | null;
  quote?: EmailQuoteSummary | null;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

const LABELS: Record<
  EmailLanguage,
  {
    viewQuote: string;
    quote: string;
    version: string;
    issued: string;
    validUntil: string;
    total: string;
    linkHint: string;
    replyHint: string;
  }
> = {
  es: {
    viewQuote: "Ver cotización",
    quote: "Cotización",
    version: "Versión",
    issued: "Emitida",
    validUntil: "Válida hasta",
    total: "Total",
    linkHint: "Si el botón no funciona, copie este enlace en su navegador:",
    replyHint: "Puede responder directamente a este correo.",
  },
  en: {
    viewQuote: "View quotation",
    quote: "Quotation",
    version: "Version",
    issued: "Issued",
    validUntil: "Valid until",
    total: "Total",
    linkHint: "If the button does not work, copy this link into your browser:",
    replyHint: "You can reply directly to this email.",
  },
  fr: {
    viewQuote: "Voir le devis",
    quote: "Devis",
    version: "Version",
    issued: "Émis le",
    validUntil: "Valable jusqu'au",
    total: "Total",
    linkHint:
      "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    replyHint: "Vous pouvez répondre directement à cet e-mail.",
  },
};

const LOCALES: Record<EmailLanguage, string> = {
  es: "es-CO",
  en: "en-US",
  fr: "fr-FR",
};

export const emailLanguage = (
  value: string | null | undefined,
): EmailLanguage => (value === "en" || value === "fr" ? value : "es");

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Only an absolute web address may become a link or an image source: no
 * `javascript:`, no `data:`, nothing relative. (`http:` is a local stack.)
 */
const webUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

/**
 * An image a customer's mail client can actually fetch. Mail clients load
 * images through their own servers, which cannot reach a local stack, so
 * anything but `https:` would arrive as a broken picture.
 */
const publicImageUrl = (value: string | null | undefined): string | null => {
  const url = webUrl(value);
  return url?.startsWith("https://") ? url : null;
};

/** Where the product's icon is served, given the CRM's public address. */
export const emailIconUrl = (
  baseUrl: string | null | undefined,
): string | null =>
  baseUrl ? `${baseUrl.replace(/\/+$/, "")}/appIcon/192.png` : null;

/** `2026-10-08` as a date of the reader's language; anything else as written. */
export const formatEmailDate = (
  value: string | null | undefined,
  language: EmailLanguage,
): string => {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat(LOCALES[language], {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
};

/**
 * The stored total with its currency. The amount is FORMATTED, never
 * computed: it is the figure the version was issued with.
 */
export const formatEmailMoney = (
  total: number | string | null | undefined,
  currency: string | null | undefined,
  language: EmailLanguage,
): string => {
  if (total == null || total === "") return "";
  const amount = Number(total);
  if (!Number.isFinite(amount)) return String(total);
  const number = new Intl.NumberFormat(LOCALES[language], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return currency ? `${number} ${currency}` : number;
};

const paragraphsOf = (text: string): string[] =>
  text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

const FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const INK = "#111827";
const MUTED = "#6b7280";
const TEXT = "#1f2937";
const BORDER = "#e5e7eb";
const SURFACE = "#f9fafb";
const AMBER = "#f59e0b";
/** The icon's own ground and ink (`public/logos/hermes_icon.svg`). */
const ICON_AMBER = "#F5A300";
const ICON_INK = "#111621";
const ICON_SIZE = 36;
/** What an inbox shows after the subject, cut from the message itself. */
const PREHEADER_LENGTH = 140;

const summaryRows = (
  quote: EmailQuoteSummary,
  language: EmailLanguage,
): Array<[string, string]> => {
  const labels = LABELS[language];
  const number = quote.quote_number
    ? quote.quote_version != null && quote.quote_version !== ""
      ? `${quote.quote_number} · ${labels.version} ${quote.quote_version}`
      : quote.quote_number
    : "";
  const rows: Array<[string, string]> = [
    [labels.quote, number],
    [labels.issued, formatEmailDate(quote.issue_date, language)],
    [labels.validUntil, formatEmailDate(quote.valid_until, language)],
    [labels.total, formatEmailMoney(quote.total, quote.currency, language)],
  ];
  return rows.filter(([, value]) => value !== "");
};

export const renderEmail = (input: RenderEmailInput): RenderedEmail => {
  const language = emailLanguage(input.language);
  const labels = LABELS[language];
  const link = webUrl(input.quoteLink);
  const logo = webUrl(input.logoUrl);
  const issuer = (input.issuerName ?? "").trim();
  const body = input.bodyText.trim();
  const hasMarker = QUOTE_LINK_PATTERN.test(body);
  QUOTE_LINK_PATTERN.lastIndex = 0;
  const rows = input.quote ? summaryRows(input.quote, language) : [];

  // Plain text: the link in place of its marker, or after the text when the
  // user removed the marker -- a quotation message always carries its link.
  const textBody = body.replace(QUOTE_LINK_PATTERN, link ?? "").trim();
  const text = [
    textBody,
    link && !hasMarker ? `${labels.viewQuote}: ${link}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  const linkHtml = link
    ? `<a href="${escapeHtml(link)}" style="color:${INK};word-break:break-all;">${escapeHtml(link)}</a>`
    : "";
  const paragraphs = paragraphsOf(body)
    .map((paragraph) => {
      // Escaped first, so the only markup in the paragraph is ours.
      const html = escapeHtml(paragraph)
        .replace(/\n/g, "<br>")
        .replace(/\{\{\s*quote_link\s*\}\}/g, linkHtml);
      return `<p style="margin:0 0 16px;line-height:1.65;color:${TEXT};">${html}</p>`;
    })
    .join("");

  const summary =
    rows.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 24px;border:1px solid ${BORDER};border-radius:8px;">${rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:10px 16px;color:${MUTED};font-size:13px;">${escapeHtml(label)}</td><td align="right" style="padding:10px 16px;font-size:14px;font-weight:600;">${escapeHtml(value)}</td></tr>`,
          )
          .join("")}</table>`
      : "";

  const button = link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="border-radius:8px;background:${AMBER};"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 24px;color:${INK};font-weight:600;text-decoration:none;">${escapeHtml(labels.viewQuote)}</a></td></tr></table><p style="margin:0 0 4px;color:${MUTED};font-size:12px;">${escapeHtml(labels.linkHint)}</p><p style="margin:0 0 16px;font-size:12px;">${linkHtml}</p>`
    : "";

  // The icon as a picture where a mail client can fetch it, and drawn in
  // plain HTML where it cannot, so the header never arrives with a hole in it.
  const icon = publicImageUrl(input.iconUrl);
  const mark = icon
    ? `<img src="${escapeHtml(icon)}" alt="" width="${ICON_SIZE}" height="${ICON_SIZE}" style="display:block;width:${ICON_SIZE}px;height:${ICON_SIZE}px;border:0;border-radius:8px;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" width="${ICON_SIZE}" height="${ICON_SIZE}" style="width:${ICON_SIZE}px;height:${ICON_SIZE}px;border-radius:8px;background:${ICON_AMBER};color:${ICON_INK};font-size:22px;font-weight:800;line-height:${ICON_SIZE}px;">H</td></tr></table>`;

  const header = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(issuer)}" height="32" style="display:block;height:32px;border:0;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle">${mark}</td>${
        issuer
          ? `<td valign="middle" style="padding-left:12px;color:#ffffff;font-size:17px;font-weight:700;letter-spacing:0.2px;">${escapeHtml(issuer)}</td>`
          : ""
      }</tr></table>`;

  const preheader = escapeHtml(
    body
      .replace(QUOTE_LINK_PATTERN, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, PREHEADER_LENGTH),
  );

  const footer = `<tr><td style="padding:18px 28px 22px;background:${SURFACE};border-top:1px solid ${BORDER};color:${MUTED};font-size:12px;line-height:1.6;">${
    issuer
      ? `<strong style="color:${INK};font-size:13px;">${escapeHtml(issuer)}</strong><br>`
      : ""
  }${escapeHtml(labels.replyHint)}</td></tr>`;

  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f4f6;${FONT}color:${INK};"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f4f6;"><tr><td align="center" style="padding:32px 12px;"><table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;"><tr><td style="background:${INK};padding:18px 28px;">${header}</td></tr><tr><td style="height:4px;background:${AMBER};font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="padding:32px 28px 16px;font-size:15px;">${paragraphs}${summary}${button}</td></tr>${footer}</table></td></tr></table></body></html>`;

  return { html, text };
};
