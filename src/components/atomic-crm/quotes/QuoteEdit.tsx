import { useRecordContext, useTranslate } from "ra-core";
import { Link } from "react-router";

import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";
import { Button } from "@/components/ui/button";

import type { QuoteSummary } from "../types";
import { QuoteActions } from "./QuoteActions";
import { QuoteInputs } from "./QuoteInputs";
import { QuoteLines } from "./QuoteLines";
import { QuoteLinksPanel } from "./QuoteLinksPanel";
import { quoteShowPath } from "./quotePaths";

/** The document this editor produces, as the customer will read it. */
const ViewDocumentButton = () => {
  const quote = useRecordContext<QuoteSummary>();
  const translate = useTranslate();
  if (!quote) return null;
  return (
    <Button asChild size="sm" variant="outline">
      <Link to={quoteShowPath(quote.id)}>
        {translate("resources.quotes.show.view_document")}
      </Link>
    </Button>
  );
};

/**
 * The quotation editor: the header above, the document's lines below.
 *
 * The lines sit outside the form for the reason a price list's prices do — each
 * one is saved the moment it is changed, and sharing the header's Save button
 * would suggest the two are one write when they are not. Here it is also what
 * the database requires: the totals are recomputed by a trigger on every line
 * write (D8), so the version's figures are only true once the line has landed.
 *
 * Pessimistic rather than the default undoable save: a header write can be
 * refused by the server for reasons the form cannot anticipate (a price list in
 * another currency, a value the version owns), and an undoable save would close
 * the form before the database had the chance to say so.
 *
 * The moves sit ABOVE the form, not in its toolbar. None of them is a save:
 * issuing freezes a version forever and mints a link, revising clones the
 * document into a new one — and a button that does either of those beside
 * "Save" reads as a variant of saving.
 *
 * The same toolbar is on the quotation page (`QuoteShow`, Phase 6): a rep
 * finishing a draft sends it from here, one reading the document sends it from
 * there. One component in both places, so the two cannot offer different moves.
 */
export const QuoteEdit = () => (
  <Edit
    // Wider than a plain form: the tables under it need the room.
    contentClassName="max-w-6xl"
    redirect={false}
    mutationMode="pessimistic"
    // The kit's default header is a Show link and a DELETE button, and the
    // second one can only fail: there is no delete policy and no DELETE
    // privilege on `quotes` for anybody (quotes 13.2, 13.6 #11) -- a quote ends
    // as `canceled`. The header is replaced rather than extended because the
    // Show link it also carries is already here as `ViewDocumentButton`.
    actions={<></>}
  >
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <QuoteActions />
      <ViewDocumentButton />
    </div>
    <SimpleForm>
      <QuoteInputs />
    </SimpleForm>
    <div className="mt-6 flex flex-col gap-6">
      <QuoteLines />
      <QuoteLinksPanel />
    </div>
  </Edit>
);
