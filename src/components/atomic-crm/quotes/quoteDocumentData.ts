/**
 * The one mapper behind the one document (quotes §9, D4).
 *
 * `QuoteDocument` takes the plain object built here and nothing else — no
 * `RecordContext`, no data provider — because three screens render the same
 * document: the quotation page, the print route, and (Phase 7) the customer
 * portal, which has no data provider at all. One component fed by one mapper is
 * what makes "the PDF is exactly the version the customer is looking at" true;
 * two templates would drift, and only the customer would see the drift.
 *
 * The groups (`quote`, `parties`, `lines`, `totals`, `terms`, `branding`,
 * `acceptance`) are the ones the portal payload of §6.3 uses, so the portal maps
 * its payload onto this shape field for field. What the payload also carries
 * and the document does not render yet (comments, actions) is left out until a
 * phase renders it.
 *
 * Two rules decide where every figure comes from, and both follow from §4:
 *
 *   * AN ISSUED VERSION IS READ, NEVER RECOMPUTED. Its parties come from
 *     `party_snapshot` and only from there — falling back to the live company
 *     would print today's address on a document sent last year, which is the
 *     exact thing the snapshot exists to prevent. Its totals are the stored
 *     columns: they are frozen with it, so they cannot be stale.
 *   * A DRAFT IS A PREVIEW. It has no snapshot yet (`issue_quote_version()`
 *     takes it at the moment of issue), so its parties are the live records,
 *     and its totals are computed from the very lines on the page with
 *     `quoteMath` — a preview must never contradict its own visible lines, and
 *     lines and version are two reads that can land at different moments.
 */

import type {
  Company,
  Contact,
  Quote,
  QuoteLine,
  QuoteSummary,
  QuoteVersion,
} from "../types";
import type { QuotePortalPayload } from "./portal/quotePortalClient";
import { lineAmounts, quoteAmounts, type QuoteAmounts } from "./quoteMath";

export type QuoteDocumentCompany = {
  name: string | null;
  address: string | null;
  zipcode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  tax_identifier: string | null;
  phone: string | null;
  website: string | null;
};

export type QuoteDocumentContact = {
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
};

export type QuoteDocumentLine = {
  key: string;
  position: number;
  sku: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_rate_percent: number;
  line_total: number;
};

export type QuoteDocumentData = {
  quote: {
    number: string;
    title: string | null;
    currency: string;
    version_number: number;
    /** Null on a draft: nothing has been issued, so this is not an offer. */
    issued_at: string | null;
    valid_until: string | null;
    /** A newer version was issued; this one is no longer the offer. */
    is_superseded: boolean;
  };
  parties: {
    company: QuoteDocumentCompany | null;
    contact: QuoteDocumentContact | null;
    owner_name: string | null;
  };
  lines: QuoteDocumentLine[];
  totals: QuoteAmounts;
  terms: string | null;
  branding: { title: string; logo_url: string | null };
  acceptance: {
    accepted_at: string | null;
    accepted_by_name: string | null;
    rejected_at: string | null;
  };
};

export type QuoteDocumentSource = {
  quote: Pick<Quote, "quote_number" | "title" | "currency"> &
    Pick<QuoteSummary, "owner_name">;
  version: QuoteVersion;
  lines: QuoteLine[];
  /**
   * The live records, read ONLY for a draft. Ignored for an issued version, on
   * purpose: see the header.
   */
  live?: { company?: Company | null; contact?: Contact | null };
  branding: { title: string; logo_url?: string | null };
};

/** A non-blank string, or null. Snapshot values are untyped jsonb. */
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const objectOf = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const fullName = (first: unknown, last: unknown) =>
  text([text(first), text(last)].filter(Boolean).join(" "));

/** `quote_party_snapshot()`'s `company` object (`02_functions.sql`). */
const companyFromSnapshot = (
  snapshot: Record<string, unknown> | null,
): QuoteDocumentCompany | null => {
  const company = objectOf(snapshot?.company);
  if (!company) return null;
  return {
    name: text(company.name),
    address: text(company.address),
    zipcode: text(company.zipcode),
    city: text(company.city),
    state: text(company.state_abbr),
    country: text(company.country),
    tax_identifier: text(company.tax_identifier),
    phone: text(company.phone_number),
    website: text(company.website),
  };
};

const contactFromSnapshot = (
  snapshot: Record<string, unknown> | null,
): QuoteDocumentContact | null => {
  const contact = objectOf(snapshot?.contact);
  if (!contact) return null;
  return {
    name: fullName(contact.first_name, contact.last_name),
    title: text(contact.title),
    email: text(contact.email),
    phone: text(contact.phone),
  };
};

const companyFromRecord = (
  company: Company | null | undefined,
): QuoteDocumentCompany | null =>
  company
    ? {
        name: text(company.name),
        address: text(company.address),
        zipcode: text(company.zipcode),
        city: text(company.city),
        state: text(company.state_abbr),
        country: text(company.country),
        tax_identifier: text(company.tax_identifier),
        phone: text(company.phone_number),
        website: text(company.website),
      }
    : null;

const contactFromRecord = (
  contact: Contact | null | undefined,
): QuoteDocumentContact | null =>
  contact
    ? {
        name: fullName(contact.first_name, contact.last_name),
        title: text(contact.title),
        // The first address and number, exactly as the snapshot picks them.
        email: text(contact.email_jsonb?.[0]?.email),
        phone: text(contact.phone_jsonb?.[0]?.number),
      }
    : null;

export const toQuoteDocument = ({
  quote,
  version,
  lines,
  live,
  branding,
}: QuoteDocumentSource): QuoteDocumentData => {
  const isIssued = version.issued_at != null;
  const snapshot = objectOf(version.party_snapshot);

  // Sorted here rather than trusted: the document's order is `position`, and a
  // caller that fetched in another order must not reorder a customer's offer.
  const ordered = [...lines].sort((a, b) => a.position - b.position);

  return {
    quote: {
      number: quote.quote_number,
      title: text(quote.title),
      currency: version.currency || quote.currency,
      version_number: version.version_number,
      issued_at: version.issued_at ?? null,
      valid_until: version.valid_until ?? null,
      is_superseded: isIssued && version.superseded_at != null,
    },
    parties: isIssued
      ? {
          company: companyFromSnapshot(snapshot),
          contact: contactFromSnapshot(snapshot),
          owner_name: text(objectOf(snapshot?.owner)?.name),
        }
      : {
          company: companyFromRecord(live?.company),
          contact: contactFromRecord(live?.contact),
          owner_name: text(quote.owner_name),
        },
    lines: ordered.map((line) => ({
      key: String(line.id),
      position: line.position,
      sku: text(line.sku),
      name: line.name,
      description: text(line.description),
      unit: text(line.unit),
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount_percent: line.discount_percent,
      tax_rate_percent: line.tax_rate_percent,
      line_total:
        isIssued && line.line_total != null
          ? line.line_total
          : lineAmounts(line).line_total,
    })),
    totals: isIssued
      ? {
          subtotal: version.subtotal,
          discount_total: version.discount_total,
          tax_total: version.tax_total,
          total: version.total,
        }
      : quoteAmounts(ordered),
    terms: text(version.terms),
    branding: {
      title: branding.title,
      logo_url: text(branding.logo_url),
    },
    acceptance: {
      accepted_at: version.accepted_at ?? null,
      accepted_by_name: text(version.accepted_by_name),
      rejected_at: version.rejected_at ?? null,
    },
  };
};

/**
 * The customer portal's payload (`quote_portal_document()`), as the same
 * document.
 *
 * The payload was built with this module's groups, so the mapping is field for
 * field, through the same snapshot readers `toQuoteDocument` uses for an issued
 * version — which is what a portal document always is. Two things do not come
 * from the payload:
 *
 *   * the line keys, taken from the order: positions can repeat (a Phase 4
 *     gap), and a React key must not;
 *   * the letterhead of an installation that never set one. The caller passes
 *     the build's own, because a portal page never loads the configuration
 *     (F3) and a blank letterhead is worse than the default one. When the
 *     installation set EITHER a title or a logo, its branding wins whole: a
 *     customer's title beside the product's logo is nobody's letterhead.
 */
export const fromPortalPayload = (
  payload: QuotePortalPayload,
  fallbackBranding: { title: string; logo_url: string | null },
): QuoteDocumentData => {
  const title = text(payload.branding.title);
  const logoUrl = text(payload.branding.logo_url);

  return {
    quote: {
      number: payload.quote.number,
      title: text(payload.quote.title),
      currency: payload.quote.currency,
      version_number: payload.quote.version_number,
      issued_at: payload.quote.issued_at,
      valid_until: payload.quote.valid_until,
      is_superseded: payload.quote.is_superseded,
    },
    parties: {
      company: companyFromSnapshot(payload.parties),
      contact: contactFromSnapshot(payload.parties),
      owner_name: text(payload.parties.owner?.name),
    },
    lines: payload.lines.map((line, index) => ({
      key: String(index),
      position: line.position,
      sku: text(line.sku),
      name: line.name,
      description: text(line.description),
      unit: text(line.unit),
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount_percent: line.discount_percent,
      tax_rate_percent: line.tax_rate_percent,
      line_total: line.line_total,
    })),
    totals: { ...payload.totals },
    terms: text(payload.terms),
    branding:
      title != null || logoUrl != null
        ? { title: title ?? fallbackBranding.title, logo_url: logoUrl }
        : fallbackBranding,
    acceptance: {
      accepted_at: payload.acceptance.accepted_at,
      accepted_by_name: text(payload.acceptance.accepted_by_name),
      rejected_at: payload.acceptance.rejected_at,
    },
  };
};

/**
 * A date as a document prints it.
 *
 * `valid_until` is a bare `YYYY-MM-DD`, and `new Date("2026-12-31")` parses it
 * as UTC midnight — which renders as December 30th for every reader west of
 * Greenwich. On a quotation that is the offer expiring a day early, in writing.
 * A bare date is therefore built from its parts, in local time; a timestamp
 * (`issued_at`) is a real instant and parses as one.
 */
export const formatDocumentDate = (
  value: string | null | undefined,
  locale?: string,
) => {
  if (!value) return "";
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = bare
    ? new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};
