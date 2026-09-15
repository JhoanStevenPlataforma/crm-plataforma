import { useGetOne, useTranslate } from "ra-core";
import { useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import type { QuoteSummary } from "../types";
import { QuoteDocument } from "./QuoteDocument";
import { quoteShowPath } from "./quotePaths";
import { useQuoteDocument } from "./useQuoteDocument";
import "./quotePrint.css";

/**
 * One version of a quotation, alone on the page, printed once it has settled
 * (quotes §9) — `/quotes/:id/print?version=<id>`.
 *
 * THE DIALOG WAITS FOR THE DOCUMENT AND FOR ITS IMAGES. Opening it while the
 * lines are loading prints a skeleton, and opening it before the logo decodes
 * prints an empty box where the letterhead should be — silently, in both cases:
 * the rep finds out when the customer opens the file. So the page waits for the
 * data, then for every `<img>` inside the document to decode (a broken image
 * counts as settled rather than holding the dialog hostage), then one frame, so
 * the layout the dialog captures is the finished one. It is the
 * `reports/ReportPrintPage.tsx` pattern with images added.
 *
 * `printed` is set at the moment of printing, not when the wait starts. Under
 * React's StrictMode the effect runs, is cleaned up and runs again; marking it
 * earlier would let the cancelled first run swallow the only print.
 *
 * The version travels in the URL and is honoured exactly: a version that is not
 * this quote's is refused on screen, never swapped for the newest one.
 */
export const QuotePrintPage = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const { data: quote, error: quoteError } = useGetOne<QuoteSummary>(
    "quotes",
    { id: id ?? "" },
    { enabled: id != null },
  );
  const { document, isUnknown, isMissing } = useQuoteDocument(
    quote,
    searchParams.get("version"),
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const printed = useRef(false);
  const isReady = document != null;

  useEffect(() => {
    if (!isReady || printed.current) return;
    let isCancelled = false;

    const images = Array.from(rootRef.current?.querySelectorAll("img") ?? []);
    Promise.all(
      images.map((image) => image.decode().catch(() => undefined)),
    ).then(() => {
      requestAnimationFrame(() => {
        if (isCancelled || printed.current) return;
        printed.current = true;
        window.print();
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [isReady]);

  return (
    <div
      ref={rootRef}
      className="quote-print-root mx-auto flex w-full max-w-4xl flex-col gap-4"
    >
      <div className="quote-print-hide flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {translate(
            isReady
              ? "resources.quotes.print.ready"
              : "resources.quotes.print.preparing",
          )}
        </p>
        <div className="flex items-center gap-2">
          {id != null ? (
            <Button asChild variant="outline" size="sm">
              <Link to={quoteShowPath(id)}>
                {translate("resources.quotes.print.back")}
              </Link>
            </Button>
          ) : null}
          {/* Offered as well as fired automatically: the automatic call happens
              once, and a rep who cancelled the dialog needs a way back to it
              without reloading. */}
          <Button size="sm" disabled={!isReady} onClick={() => window.print()}>
            {translate("resources.quotes.print.again")}
          </Button>
        </div>
      </div>

      {quoteError != null || isUnknown ? (
        <p className="text-sm text-destructive">
          {translate("resources.quotes.show.load_error")}
        </p>
      ) : isMissing ? (
        <p className="text-sm text-destructive">
          {translate("resources.quotes.print.version_missing")}
        </p>
      ) : document ? (
        <QuoteDocument data={document} />
      ) : (
        <Skeleton className="h-96 w-full rounded-xl" />
      )}
    </div>
  );
};
