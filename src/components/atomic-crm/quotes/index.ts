import type { Quote } from "../types";
import { QuoteCreate } from "./QuoteCreate";
import { QuoteEdit } from "./QuoteEdit";
import { QuoteList } from "./QuoteList";
import { QuoteShow } from "./QuoteShow";

/**
 * A row opens the quotation's page (Phase 6): the document as the customer
 * reads it, its versions, its moves and its links. The editor is one click
 * further, because once a version is issued there is nothing left on it to edit.
 * Creating still lands in the editor — a quote with no lines is not a document.
 */
export default {
  list: QuoteList,
  create: QuoteCreate,
  edit: QuoteEdit,
  show: QuoteShow,
  recordRepresentation: (record: Quote) =>
    record.title
      ? `${record.quote_number} — ${record.title}`
      : record.quote_number,
};
