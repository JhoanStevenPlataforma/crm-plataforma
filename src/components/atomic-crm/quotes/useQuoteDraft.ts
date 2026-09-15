import { useGetList } from "ra-core";

import type { QuoteLine, QuoteSummary, QuoteVersion } from "../types";

/** A document has tens of lines, not thousands: one page holds all of them. */
const LINES_PAGE = { page: 1, perPage: 200 };

/**
 * The version a quotation is currently working on, and its lines.
 *
 * There is deliberately no `quotes.current_version_id` column — it would close
 * a foreign-key cycle with `quote_versions.quote_id` and force deferrable
 * constraints and an insertion order (§2.3). The current version is derived
 * instead, newest first, exactly as `quotes_summary` derives it.
 *
 * `isEditable` is the union of both rules the database enforces, because the UI
 * must not offer what the server will refuse: a line may only be written while
 * the VERSION is unissued (`quote_version_frozen`) *and* the QUOTE is a draft
 * (`quote_not_draft`). The second is what makes an approval certify the lines
 * it actually saw — get 10% approved, then type 40% is the hole it closes.
 *
 * A failed load is not an empty document: `isUnknown` says so, and the panel
 * refuses to offer an add button rather than inviting a line onto a version it
 * could not read.
 */
export const useQuoteDraft = (quote?: QuoteSummary | null) => {
  const {
    data: versions,
    isPending: isVersionPending,
    error: versionError,
  } = useGetList<QuoteVersion>(
    "quote_versions",
    {
      filter: { quote_id: quote?.id },
      sort: { field: "version_number", order: "DESC" },
      pagination: { page: 1, perPage: 1 },
    },
    { enabled: quote?.id != null },
  );

  const version = versions?.[0] ?? null;

  const {
    data: lines,
    isPending: isLinesPending,
    error: linesError,
  } = useGetList<QuoteLine>(
    "quote_lines",
    {
      filter: { version_id: version?.id },
      sort: { field: "position", order: "ASC" },
      pagination: LINES_PAGE,
    },
    { enabled: version?.id != null },
  );

  return {
    version,
    lines: lines ?? [],
    isPending: isVersionPending || (version != null && isLinesPending),
    isUnknown: versionError != null || linesError != null,
    isEditable:
      quote?.status_key === "draft" &&
      version != null &&
      version.issued_at == null,
  };
};
