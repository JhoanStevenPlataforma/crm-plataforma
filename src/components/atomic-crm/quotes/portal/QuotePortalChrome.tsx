import { ArrowDownRight, ArrowUp } from "lucide-react";
import { useTranslate } from "ra-core";

import { cn } from "@/lib/utils";

import { scrollToSection, useScrollProgressRef } from "./useQuotePortalScroll";

export type QuotePortalSection = { id: string; label: string };

/**
 * The frame around the proposal: a reading-progress bar, the floating
 * letterhead bar, the dot navigation and the two floating buttons.
 *
 * All of it is `quote-print-hide`. On paper the proposal is the document, and a
 * fixed bar would print over the top of every page.
 */

export const QuotePortalProgress = () => {
  const ref = useScrollProgressRef();
  return (
    <div
      ref={ref}
      aria-hidden
      // `transform`, not Tailwind's `scale-x-*`: those set the separate `scale`
      // property, which would multiply with the width written on scroll.
      style={{ transform: "scaleX(0)" }}
      className="quote-print-hide fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-gradient-to-r from-brand to-brand-subtle"
    />
  );
};

/**
 * The letterhead, floating over the page. It lives on the hero's dark ground
 * and keeps that ground when it scrolls over the document, so it is drawn with
 * the `.dark` palette whatever theme the reader's browser prefers.
 */
export const QuotePortalTopbar = ({
  brand,
  number,
  versionNumber,
}: {
  brand: string;
  number: string;
  versionNumber: number;
}) => {
  const translate = useTranslate();
  return (
    <header className="quote-print-hide dark fixed inset-x-0 top-2 z-40 mx-auto flex w-[calc(100%-1rem)] max-w-[1180px] items-center justify-between gap-3 rounded-2xl border border-white/10 bg-background/80 px-4 py-2.5 text-foreground shadow-xl backdrop-blur-lg sm:top-4 sm:w-[calc(100%-2rem)]">
      <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
        <span
          aria-hidden
          className="size-6 shrink-0 rounded-md border-2 border-brand-subtle"
        />
        <span className="truncate">{brand}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-white/15 px-2.5 py-1.5 tabular-nums">
          {number}
        </span>
        <span className="hidden rounded-full border border-white/15 px-2.5 py-1.5 sm:inline">
          {translate("resources.quotes.document.version", {
            number: versionNumber,
          })}
        </span>
      </span>
    </header>
  );
};

/** One dot per section, the one being read highlighted. Wide screens only. */
export const QuotePortalMiniNav = ({
  sections,
  activeId,
}: {
  sections: readonly QuotePortalSection[];
  activeId: string | null;
}) => {
  const translate = useTranslate();
  return (
    <nav
      aria-label={translate("resources.quotes.portal.landing.sections")}
      className="quote-print-hide fixed top-1/2 left-5.5 z-30 hidden -translate-y-1/2 flex-col gap-2.5 min-[1000px]:flex"
    >
      {sections.map((section) => {
        const isActive = section.id === activeId;
        return (
          <button
            key={section.id}
            type="button"
            aria-label={section.label}
            aria-current={isActive ? "true" : undefined}
            onClick={() => scrollToSection(section.id)}
            className="group relative flex size-4 items-center justify-center"
          >
            <span
              className={cn(
                "size-2.5 rounded-full bg-border-strong transition-all",
                isActive && "bg-brand ring-4 ring-brand/15",
              )}
            />
            <span className="pointer-events-none absolute left-6 rounded-md bg-foreground px-2 py-1.5 text-[10px] whitespace-nowrap text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {section.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

/**
 * "Back to top", once the reader has scrolled, and "View quotation" while the
 * quotation is not what they are reading — over it, the button would sit on
 * top of the conversation's send button.
 */
export const QuotePortalFloatingActions = ({
  topId,
  quoteId,
  isPastFold,
  isReadingQuote,
}: {
  topId: string;
  quoteId: string;
  isPastFold: boolean;
  isReadingQuote: boolean;
}) => {
  const translate = useTranslate();
  return (
    <div className="quote-print-hide fixed right-3 bottom-3 z-40 flex flex-col items-end gap-3 sm:right-5 sm:bottom-5">
      <button
        type="button"
        aria-label={translate("resources.quotes.portal.landing.back_to_top")}
        onClick={() => scrollToSection(topId)}
        className={cn(
          "grid size-10 place-items-center rounded-full border bg-card text-card-foreground shadow-lg transition-opacity",
          isPastFold ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        tabIndex={isPastFold ? 0 : -1}
      >
        <ArrowUp className="size-4" />
      </button>
      {isReadingQuote ? null : (
        <button
          type="button"
          onClick={() => scrollToSection(quoteId)}
          className="dark flex items-center gap-2 rounded-full border border-white/10 bg-background/90 py-2 pr-4 pl-2 text-xs font-semibold text-foreground opacity-85 shadow-xl backdrop-blur-md transition hover:-translate-y-0.5 hover:opacity-100"
        >
          <span className="grid size-7 place-items-center rounded-full bg-brand text-brand-foreground">
            <ArrowDownRight className="size-4" />
          </span>
          {translate("resources.quotes.portal.landing.view_quote")}
        </button>
      )}
    </div>
  );
};
