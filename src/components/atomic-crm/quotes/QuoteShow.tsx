import {
  ShowBase,
  useShowContext,
  useTranslate,
  type Identifier,
} from "ra-core";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import type { QuoteSummary } from "../types";
import { QuoteActions } from "./QuoteActions";
import { QuoteComments } from "./QuoteComments";
import { QuoteDocument } from "./QuoteDocument";
import { QuoteLinksPanel } from "./QuoteLinksPanel";
import { QuoteVersionsPanel } from "./QuoteVersionsPanel";
import { quoteEditPath, quotePrintPath } from "./quotePaths";
import { useQuoteDocument } from "./useQuoteDocument";
import "./quotePrint.css";

/**
 * A quotation's own page: the document, its versions, its moves, its links and
 * the negotiation thread (quotes §9).
 *
 * A PAGE, not a dialog — a deliberate departure from `deals/DealShow.tsx`. The
 * print styles are scoped under `.quote-print-root`, and that class has to sit
 * on the page root for them to stay scoped; a dialog is portalled out of the
 * page and prints over whatever is behind it.
 *
 * So the browser's own "Print" on this page already yields the bare document:
 * the controls around it carry `.quote-print-hide`. The Print button goes to
 * the print route rather than calling `window.print()` here, because that route
 * is the one place that waits for the logo to decode before the dialog opens —
 * one print path, not two that fail differently.
 */
export const QuoteShow = () => (
  <ShowBase>
    <QuoteShowContent />
  </ShowBase>
);

const QuoteShowContent = () => {
  const { record: quote, isPending } = useShowContext<QuoteSummary>();
  const translate = useTranslate();
  // Null means "whatever is current", so a revision opened from this page shows
  // the new draft straight away instead of leaving the old version selected.
  const [selectedId, setSelectedId] = useState<Identifier | null>(null);
  const {
    versions,
    version,
    document,
    isPending: isDocumentPending,
    isUnknown,
  } = useQuoteDocument(quote, selectedId);

  if (isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!quote) return null;

  const select = (id: Identifier) =>
    setSelectedId(String(id) === String(versions[0]?.id) ? null : id);

  const printLabel = translate("resources.quotes.show.print");

  return (
    <div className="quote-print-root flex flex-col gap-4">
      <div className="quote-print-hide flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-xl font-semibold">
            {quote.title
              ? `${quote.quote_number} — ${quote.title}`
              : quote.quote_number}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[quote.company_name, quote.deal_name].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to={quoteEditPath(quote.id)}>
              {translate("resources.quotes.show.edit")}
            </Link>
          </Button>
          {document ? (
            <Button asChild size="sm">
              <Link to={quotePrintPath(quote.id, version?.id)}>
                {printLabel}
              </Link>
            </Button>
          ) : (
            <Button size="sm" disabled>
              {printLabel}
            </Button>
          )}
        </div>
      </div>

      <div className="quote-print-hide">
        <QuoteActions />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {isUnknown ? (
            <p className="text-sm text-destructive">
              {translate("resources.quotes.show.load_error")}
            </p>
          ) : isDocumentPending || document == null ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : (
            <QuoteDocument data={document} />
          )}
          <QuoteComments quoteId={quote.id} versions={versions} />
        </div>
        <aside className="quote-print-hide flex flex-col gap-6">
          <QuoteVersionsPanel
            versions={versions}
            selectedId={version?.id}
            onSelect={select}
            isUnknown={isUnknown}
          />
          <QuoteLinksPanel />
        </aside>
      </div>
    </div>
  );
};
