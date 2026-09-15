import type { Identifier } from "ra-core";

/**
 * Where a quotation's pages live.
 *
 * Its own module so a list row, the deal panel and the editor can link to the
 * document without importing a page component and everything it renders.
 */

/** The quotation's own page: the document, its versions, its links (§9). */
export const quoteShowPath = (id: Identifier) => `/quotes/${id}/show`;

/** The editor. Only a draft has anything left to edit there. */
export const quoteEditPath = (id: Identifier) => `/quotes/${id}`;

/**
 * The print route: one version, rendered alone, printed once it has settled.
 *
 * The version travels in the URL. Without it the page prints whatever is
 * newest, and "newest" can change between opening the page and the dialog
 * appearing — the PDF must be the version the rep was looking at.
 */
export const quotePrintPath = (
  id: Identifier,
  versionId?: Identifier | null,
) =>
  versionId == null
    ? `/quotes/${id}/print`
    : `/quotes/${id}/print?version=${encodeURIComponent(String(versionId))}`;
