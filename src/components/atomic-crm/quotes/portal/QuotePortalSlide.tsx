import { cn } from "@/lib/utils";

import { QuotePortalReveal } from "./QuotePortalReveal";
import type {
  QuotePortalMedia,
  QuotePortalSlide as Slide,
} from "./quotePortalPresentation";

/** The dark stage every slide shares with the cover. */
export const PORTAL_STAGE_GLOW =
  "bg-[radial-gradient(circle_at_88%_18%,color-mix(in_oklch,var(--info)_18%,transparent),transparent_25%),radial-gradient(circle_at_8%_82%,color-mix(in_oklch,var(--brand)_10%,transparent),transparent_24%)]";

const SlideMedia = ({ media }: { media: QuotePortalMedia }) =>
  media.kind === "video" ? (
    // Muted and inline so it may start on its own on a phone; the controls let
    // the reader turn the sound on. Never autoplays with sound.
    <video
      src={media.url}
      poster={media.poster}
      aria-label={media.alt}
      controls
      muted
      playsInline
      preload="metadata"
      className="block max-h-[22svh] w-full rounded-xl object-contain min-[1000px]:max-h-[70svh] min-[1000px]:rounded-2xl"
    />
  ) : (
    <img
      src={media.url}
      alt={media.alt}
      loading="lazy"
      decoding="async"
      className="block h-auto max-h-[22svh] w-full rounded-xl object-contain min-[1000px]:max-h-[70svh] min-[1000px]:rounded-2xl"
    />
  );

/**
 * One slide of the presentation before the quotation: the picture on one
 * side, the eyebrow, heading, copy and highlights on the other; stacked on
 * narrow screens, never printed.
 *
 * ONE SLIDE, ONE SCREEN. Type, spacing and the picture are sized against the
 * viewport HEIGHT (`svh`) as well as its width, so a slide reads whole on a
 * laptop at 720 px as on a monitor at 1080 — nobody scrolls inside a slide to
 * find the end of its text. `min-h` rather than `h`: a deck with far more copy
 * than the limits intend grows instead of cutting its text off.
 */
export const QuotePortalSlide = ({
  id,
  slide,
  number,
}: {
  id: string;
  slide: Slide;
  number: string;
}) => {
  const isMediaLeft = slide.mediaSide === "left";
  const titleId = `${id}-title`;

  const media = (
    <QuotePortalReveal
      effect="zoom"
      className="flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-background to-surface-muted p-1.5 shadow-2xl shadow-black/30 min-[1000px]:rounded-[26px] min-[1000px]:p-3"
    >
      <SlideMedia media={slide.media} />
    </QuotePortalReveal>
  );

  const copy = (
    <QuotePortalReveal>
      <p className="mb-[clamp(.5rem,1.8svh,1.25rem)] text-[11px] font-bold tracking-[0.2em] text-brand uppercase">
        {number} · {slide.eyebrow}
      </p>
      <h2
        id={titleId}
        className="mb-[clamp(.75rem,2.2svh,1.5rem)] text-[clamp(1.5rem,min(7vw,4.4svh),2.25rem)] leading-[1.02] font-bold tracking-[-0.05em] text-balance min-[1000px]:text-[clamp(2rem,min(3.4vw,6svh),3.75rem)]"
      >
        {slide.title}
      </h2>
      {slide.paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className="mb-[clamp(.5rem,1.6svh,1.25rem)] text-[clamp(.8125rem,1.9svh,1rem)] leading-[1.6] whitespace-pre-line text-muted-foreground"
        >
          {paragraph}
        </p>
      ))}
      {slide.highlights.length > 0 ? (
        <ul className="mt-[clamp(.75rem,2.4svh,2rem)] grid grid-cols-2 gap-2 min-[1000px]:gap-3">
          {slide.highlights.map((highlight, index) => (
            <li
              key={index}
              className="rounded-xl border border-white/10 bg-white/[0.035] p-[clamp(.625rem,1.6svh,1.125rem)] min-[1000px]:rounded-2xl"
            >
              <strong className="mb-1 block text-[clamp(.75rem,1.6svh,.875rem)]">
                {highlight.title}
              </strong>
              <span className="block text-[clamp(.6875rem,1.4svh,.75rem)] leading-snug text-muted-foreground">
                {highlight.text}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </QuotePortalReveal>
  );

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn(
        "quote-print-hide dark relative flex min-h-svh items-center bg-background pt-[76px] pb-5 text-foreground min-[1000px]:pt-24 min-[1000px]:pb-10",
        PORTAL_STAGE_GLOW,
      )}
    >
      <div
        className={cn(
          "mx-auto grid w-[min(1160px,calc(100%-28px))] items-center gap-[clamp(1rem,2.6svh,2.25rem)] min-[641px]:w-[min(1160px,calc(100%-48px))] min-[1000px]:gap-12",
          isMediaLeft
            ? "min-[1000px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
            : "min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]",
        )}
      >
        {isMediaLeft ? (
          <>
            {media}
            {copy}
          </>
        ) : (
          <>
            {copy}
            {media}
          </>
        )}
      </div>
    </section>
  );
};
