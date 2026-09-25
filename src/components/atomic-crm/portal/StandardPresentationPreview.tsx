import { useTranslate } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import "../quotes/portal/quotePortal.css";
import { QuotePortalHero } from "../quotes/portal/QuotePortalHero";
import { QuotePortalSlide } from "../quotes/portal/QuotePortalSlide";
import {
  DEFAULT_QUOTE_PRESENTATION,
  personalizePresentation,
  slideNumber,
  slideSectionId,
} from "../quotes/portal/quotePortalPresentation";
import { useQuotePortalDisplayFont } from "../quotes/portal/useQuotePortalDisplayFont";

const SECTION_IDS = DEFAULT_QUOTE_PRESENTATION.slides.map(slideSectionId);

/** The customer's name the preview is written for. */
const SAMPLE_VALUES = { contact: "", quote: "" };

/**
 * The default template exactly as a customer sees it — the same components the
 * portal renders, full screen — for the admin to look at before making it the
 * active one. Opened in its own tab from the editor; the quotation that
 * follows in the real portal is not part of it.
 */
export const StandardPresentationPreview = () => {
  const translate = useTranslate();
  const { title } = useConfigurationContext();
  useQuotePortalDisplayFont();
  const deck = personalizePresentation(DEFAULT_QUOTE_PRESENTATION, {
    ...SAMPLE_VALUES,
    company: translate("crm.portal_slides.templates.sample_company"),
    brand: title,
  });
  const lastId = SECTION_IDS[SECTION_IDS.length - 1] ?? "portal-preview-cover";

  return (
    <main className="min-h-screen bg-background">
      <QuotePortalHero
        id="portal-preview-cover"
        cover={deck.cover}
        nextId={SECTION_IDS[0] ?? lastId}
        quoteId={lastId}
      />
      {deck.slides.map((slide, index) => (
        <QuotePortalSlide
          key={slide.key}
          id={SECTION_IDS[index]}
          slide={slide}
          number={slideNumber(index)}
        />
      ))}
    </main>
  );
};

StandardPresentationPreview.path = "/portal/preview/standard";
