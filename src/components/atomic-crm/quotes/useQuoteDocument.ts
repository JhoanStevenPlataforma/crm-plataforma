import { useGetList, useGetOne, type Identifier } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type {
  Company,
  Contact,
  QuoteLine,
  QuoteSummary,
  QuoteVersion,
} from "../types";
import { toQuoteDocument } from "./quoteDocumentData";

/** A quotation is revised a handful of times, not a hundred (quotes §11). */
const VERSIONS_PAGE = { page: 1, perPage: 100 };
/** A document has tens of lines, not thousands: one page holds all of them. */
const LINES_PAGE = { page: 1, perPage: 200 };

/**
 * Everything one version of a quotation needs to be printed, read from the CRM.
 *
 * This hook is the INTERNAL side of the document: it owns the fetching and the
 * configuration context, so that `QuoteDocument` owns neither. The portal
 * (Phase 7) replaces this hook with its server payload and keeps the component.
 *
 * `requestedVersionId` null means "the current version". A requested id that is
 * not one of this quote's versions is reported as `isMissing` rather than
 * quietly replaced by the newest: the print route would otherwise print a
 * different document from the one it was asked for.
 *
 * The live company and contact are read only for a draft. An issued version
 * prints its `party_snapshot`, and fetching the live records for it would be
 * two requests whose only possible use is the mistake the snapshot prevents.
 *
 * `isPending` counts only the queries that are ENABLED. A disabled react-query
 * query stays `pending` forever, so folding one in would hold the print dialog
 * back indefinitely for every issued document.
 */
export const useQuoteDocument = (
  quote: QuoteSummary | null | undefined,
  requestedVersionId?: Identifier | null,
) => {
  const { title, lightModeLogo } = useConfigurationContext();

  const versionsQuery = useGetList<QuoteVersion>(
    "quote_versions",
    {
      filter: { quote_id: quote?.id },
      sort: { field: "version_number", order: "DESC" },
      pagination: VERSIONS_PAGE,
    },
    { enabled: quote?.id != null },
  );
  const versions = versionsQuery.data ?? [];
  const version =
    requestedVersionId == null
      ? (versions[0] ?? null)
      : (versions.find(
          (row) => String(row.id) === String(requestedVersionId),
        ) ?? null);

  const linesQuery = useGetList<QuoteLine>(
    "quote_lines",
    {
      filter: { version_id: version?.id },
      sort: { field: "position", order: "ASC" },
      pagination: LINES_PAGE,
    },
    { enabled: version?.id != null },
  );

  const isDraft = version != null && version.issued_at == null;
  const needsCompany = isDraft && quote?.company_id != null;
  const needsContact = isDraft && quote?.contact_id != null;

  const companyQuery = useGetOne<Company>(
    "companies",
    { id: quote?.company_id ?? "" },
    { enabled: needsCompany },
  );
  const contactQuery = useGetOne<Contact>(
    "contacts",
    { id: quote?.contact_id ?? "" },
    { enabled: needsContact },
  );

  const isUnknown = versionsQuery.error != null || linesQuery.error != null;
  const isPending =
    quote == null ||
    versionsQuery.isPending ||
    (version != null && linesQuery.isPending) ||
    (needsCompany && companyQuery.isPending) ||
    (needsContact && contactQuery.isPending);
  const isMissing =
    quote != null && !versionsQuery.isPending && !isUnknown && version == null;

  const document =
    quote != null && version != null && !isPending && !isUnknown
      ? toQuoteDocument({
          quote,
          version,
          lines: linesQuery.data ?? [],
          // A company or contact that failed to load prints as an empty block
          // on a preview; it never blocks the document.
          live: { company: companyQuery.data, contact: contactQuery.data },
          // Paper is a light surface, so the light logo.
          branding: { title, logo_url: lightModeLogo },
        })
      : null;

  return { versions, version, document, isPending, isUnknown, isMissing };
};
