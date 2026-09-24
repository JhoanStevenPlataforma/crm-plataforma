import { useTranslate } from "ra-core";

import { Button } from "@/components/ui/button";

import { QuotePortalReveal } from "./QuotePortalReveal";
import type { QuotePortalCover } from "./quotePortalPresentation";
import { scrollToSection } from "./useQuotePortalScroll";

/**
 * The cover of the proposal: a photograph under a dark wash, the company's
 * line, and the way in.
 *
 * Always on the `.dark` palette — a cover is a designed surface, not a screen
 * that follows the reader's theme — and never printed: the PDF opens on the
 * quotation itself, whose header already carries both parties.
 *
 * "Start" leads to the first slide, and a second button skips straight to the
 * quotation. With no slides the two would go to the same place, so only one is
 * drawn.
 */
export const QuotePortalHero = ({
  id,
  cover,
  nextId,
  quoteId,
}: {
  id: string;
  cover: QuotePortalCover;
  nextId: string;
  quoteId: string;
}) => {
  const translate = useTranslate();
  const hasSlides = nextId !== quoteId;

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="quote-print-hide dark relative flex min-h-svh items-center justify-center overflow-hidden bg-background text-foreground"
    >
      {cover.image ? (
        <QuotePortalReveal effect="zoom" className="absolute inset-0">
          <img
            src={cover.image.url}
            alt={cover.image.alt}
            fetchPriority="high"
            className="block size-full scale-[1.02] object-cover object-center"
          />
        </QuotePortalReveal>
      ) : null}
      {/* The photograph's colour cast, then the wash that keeps the copy
          readable on any picture. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_72%_38%,color-mix(in_oklch,var(--info)_22%,transparent),transparent_27%),radial-gradient(circle_at_12%_78%,color-mix(in_oklch,var(--brand)_20%,transparent),transparent_28%),linear-gradient(180deg,rgb(2_5_12/.10),rgb(2_5_12/.52))]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(90deg,rgb(3_7_15/.84)_0%,rgb(3_7_15/.36)_50%,rgb(3_7_15/.72)_100%)]"
      />

      <div className="relative z-10 w-[min(1160px,calc(100%-28px))] pt-[76px] pb-6 min-[641px]:w-[min(1160px,calc(100%-48px))] min-[1000px]:pt-24 min-[1000px]:pb-12">
        <QuotePortalReveal>
          <p className="mb-[clamp(.75rem,2svh,1.125rem)] text-[11px] font-bold tracking-[0.2em] text-brand uppercase">
            {cover.eyebrow}
          </p>
        </QuotePortalReveal>
        <QuotePortalReveal>
          <h1
            id={`${id}-title`}
            className="mb-[clamp(1rem,2.8svh,1.625rem)] max-w-[900px] text-[clamp(2rem,min(10vw,6svh),3rem)] leading-[0.96] font-bold tracking-[-0.06em] min-[641px]:text-[clamp(2.5rem,min(7vw,9.5svh),5.375rem)]"
          >
            {cover.title}
            {cover.titleAccent ? (
              <>
                <br />
                <span className="text-brand">{cover.titleAccent}</span>
              </>
            ) : null}
          </h1>
        </QuotePortalReveal>
        <QuotePortalReveal>
          <p className="max-w-[640px] text-[clamp(.9375rem,2.1svh,1.0625rem)] leading-[1.7] text-muted-foreground">
            {cover.body}
          </p>
        </QuotePortalReveal>
        <QuotePortalReveal className="mt-[clamp(1.25rem,4.5svh,2.625rem)] flex flex-wrap gap-3">
          <Button
            size="lg"
            className="rounded-xl bg-brand font-bold text-brand-foreground shadow-[0_10px_30px] shadow-brand/20 hover:bg-brand/90"
            onClick={() => scrollToSection(nextId)}
          >
            {translate(
              hasSlides
                ? "resources.quotes.portal.landing.start"
                : "resources.quotes.portal.landing.view_quote",
            )}
            <span aria-hidden>→</span>
          </Button>
          {hasSlides ? (
            <Button
              size="lg"
              variant="outline"
              className="rounded-xl border-white/20 bg-transparent font-bold hover:bg-white/10"
              onClick={() => scrollToSection(quoteId)}
            >
              {translate("resources.quotes.portal.landing.skip_to_quote")}
            </Button>
          ) : null}
        </QuotePortalReveal>
        <QuotePortalReveal>
          <p className="mt-[clamp(1.25rem,6svh,3.75rem)] flex items-center [@media(max-height:680px)]:hidden gap-2.5 text-xs text-muted-foreground">
            <i aria-hidden className="h-px w-8.5 bg-muted-foreground" />
            {translate("resources.quotes.portal.landing.scroll_hint")}
          </p>
        </QuotePortalReveal>
      </div>
    </section>
  );
};
