import { useTranslate } from "ra-core";

import { Button } from "@/components/ui/button";

import type { PortalSlideContent } from "./portalSlides";
import { QuotePortalReveal } from "./QuotePortalReveal";
import { SlideElements, SlideStage } from "./SlideStage";
import { scrollToSection } from "./useQuotePortalScroll";

/**
 * One of the company's slides, as a section of the customer's page: the 16:9
 * stage as large as the screen allows without scrolling (one slide, one
 * screen), then the way on. Never printed: the PDF is the quotation.
 */
export const QuotePortalCanvasSlide = ({
  id,
  label,
  slide,
  nextId,
  quoteId,
}: {
  id: string;
  /** "Slide 2 of 5": the section's accessible name and the dot's tooltip. */
  label: string;
  slide: PortalSlideContent;
  nextId: string;
  quoteId: string;
}) => {
  const translate = useTranslate();
  return (
    <section
      id={id}
      aria-label={label}
      className="quote-print-hide dark relative flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-3 pt-20 pb-8 text-foreground sm:px-6"
    >
      <QuotePortalReveal
        effect="zoom"
        // As wide as the screen, unless that would make it taller than the
        // room left under the letterhead bar and above the button.
        className="w-[min(100%,calc((100svh-11rem)*16/9))]"
      >
        <SlideStage className="rounded-2xl shadow-float ring-1 ring-white/10">
          <SlideElements elements={slide.elements} />
        </SlideStage>
      </QuotePortalReveal>
      <Button
        variant="outline"
        className="rounded-xl border-white/20 bg-transparent font-semibold hover:bg-white/10"
        onClick={() => scrollToSection(nextId)}
      >
        {translate(
          nextId === quoteId
            ? "resources.quotes.portal.landing.view_quote"
            : "resources.quotes.portal.landing.continue",
        )}
        <span aria-hidden>↓</span>
      </Button>
    </section>
  );
};
