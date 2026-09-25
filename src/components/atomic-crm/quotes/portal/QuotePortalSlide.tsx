import { cn } from "@/lib/utils";

import { QuotePortalReveal } from "./QuotePortalReveal";
import { fx } from "./quotePortalFx";
import { QUOTE_PORTAL_ICONS } from "./quotePortalIcons";
import type {
  QuotePortalMedia,
  QuotePortalSlide as Slide,
} from "./quotePortalPresentation";

/** The dark stage every slide shares with the cover. */
export const PORTAL_STAGE_GLOW =
  "bg-[radial-gradient(circle_at_88%_18%,color-mix(in_oklch,var(--info)_18%,transparent),transparent_25%),radial-gradient(circle_at_8%_82%,color-mix(in_oklch,var(--brand)_10%,transparent),transparent_24%)]";

/**
 * A `contain` picture keeps its own proportions, so a panoramic one stays
 * short; a `cover` picture fills a frame as tall as the slide allows. Both
 * are capped against the viewport height so the slide still fits one screen.
 */
const CONTAIN_CLASS =
  "block h-auto max-h-[22svh] w-full [@media(max-height:680px)]:max-h-[19svh] rounded-xl object-contain min-[1000px]:max-h-[70svh] min-[1000px]:rounded-2xl";
const COVER_CLASS =
  "block h-[22svh] w-full rounded-xl object-cover [@media(max-height:680px)]:h-[19svh] min-[1000px]:h-[min(68svh,760px)] min-[1000px]:rounded-2xl";

const SlideMedia = ({ media }: { media: QuotePortalMedia }) => {
  if (media.kind === "video") {
    return (
      // Muted and inline so it may start on its own on a phone; the controls
      // let the reader turn the sound on. Never autoplays with sound.
      <video
        src={media.url}
        poster={media.poster}
        aria-label={media.alt}
        controls
        muted
        playsInline
        preload="metadata"
        className={CONTAIN_CLASS}
      />
    );
  }
  return (
    <img
      src={media.url}
      alt={media.alt}
      loading="lazy"
      decoding="async"
      className={media.fit === "cover" ? COVER_CLASS : CONTAIN_CLASS}
      style={
        media.fit === "cover"
          ? { objectPosition: `${media.focus.x}% ${media.focus.y}%` }
          : undefined
      }
    />
  );
};

/** FX-12: between two pieces of a slide coming in, in reading order. */
const STAGGER_MS = 90;

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
 *
 * The `FX-NN` tags mark the visual refinements of `quotePortalFx.ts`; each is
 * switched there.
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
  // FX-07: every other slide stands on the slightly lighter surface.
  const isAlternate = fx(7) && Number(number) % 2 === 0;
  // FX-12: each piece waits for the one before it.
  const step = (position: number) => (fx(12) ? position * STAGGER_MS : 0);
  const highlightsFrom = 2 + slide.paragraphs.length;

  const media = (
    <QuotePortalReveal
      // FX-09: the picture turns in from its outer edge.
      effect={fx(9) ? (isMediaLeft ? "tilt-left" : "tilt-right") : "zoom"}
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl p-1.5 min-[1000px]:rounded-[26px] min-[1000px]:p-3",
        fx(8)
          ? // FX-08: a fine lit border and an amber shadow.
            "border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.02] to-transparent shadow-[0_40px_90px_-30px] shadow-brand/35"
          : "bg-gradient-to-br from-background to-surface-muted shadow-2xl shadow-black/30",
      )}
    >
      {fx(8) ? (
        // FX-08: light catching the frame's top corner.
        <span
          aria-hidden
          className="pointer-events-none absolute -top-1/3 -left-1/4 size-2/3 rounded-full bg-white/15 blur-3xl"
        />
      ) : null}
      <div className="relative w-full">
        <SlideMedia media={slide.media} />
      </div>
    </QuotePortalReveal>
  );

  const copy = (
    <div className="relative">
      <QuotePortalReveal delay={step(0)}>
        <p className="mb-[clamp(.5rem,1.8svh,1.25rem)] flex items-center gap-3 text-[11px] font-bold tracking-[0.2em] text-brand uppercase">
          {fx(13) ? (
            // FX-13: an amber rule drawn in beside the eyebrow.
            <span
              aria-hidden
              className="h-px w-7 origin-left scale-x-0 bg-brand transition-transform delay-300 duration-700 group-data-[shown=true]:scale-x-100"
            />
          ) : null}
          <span>
            {number} · {slide.eyebrow}
          </span>
        </p>
      </QuotePortalReveal>
      <QuotePortalReveal delay={step(1)}>
        <h2
          id={titleId}
          className={cn(
            "mb-[clamp(.75rem,2.2svh,1.5rem)] text-[clamp(1.375rem,min(7.5vw,4.6svh),2.5rem)] leading-[1.02] font-bold tracking-[-0.05em] text-balance min-[1000px]:text-[clamp(2.25rem,min(3.8vw,6.8svh),4.25rem)]",
            fx(28) && "qp-display tracking-[-0.035em]", // FX-28
          )}
        >
          {slide.title}
        </h2>
      </QuotePortalReveal>
      {slide.paragraphs.map((paragraph, index) => (
        <QuotePortalReveal key={index} delay={step(2 + index)}>
          <p className="mb-[clamp(.5rem,1.6svh,1.25rem)] text-[clamp(.8125rem,2svh,1.0625rem)] leading-[1.6] whitespace-pre-line text-muted-foreground min-[1000px]:text-[clamp(.9375rem,2.2svh,1.1875rem)]">
            {paragraph}
          </p>
        </QuotePortalReveal>
      ))}
      {slide.highlights.length > 0 ? (
        <ul className="mt-[clamp(.75rem,2.4svh,2rem)] grid grid-cols-2 gap-2 min-[1000px]:gap-3">
          {slide.highlights.map((highlight, index) => {
            const Icon =
              fx(10) && highlight.icon
                ? QUOTE_PORTAL_ICONS[highlight.icon]
                : null;
            return (
              <QuotePortalReveal
                as="li"
                key={index}
                delay={step(highlightsFrom + index)}
              >
                {/* The card is inside the reveal, so the entrance delay never
                    slows its hover down. */}
                <div
                  className={cn(
                    "h-full rounded-xl border border-white/10 bg-white/[0.035] p-[clamp(.625rem,1.6svh,1.125rem)] min-[1000px]:rounded-2xl",
                    // FX-11: the card lights up and lifts under the pointer.
                    fx(11) &&
                      "transition duration-300 hover:-translate-y-0.5 hover:border-brand/50 hover:bg-white/[0.06] hover:shadow-[0_0_28px] hover:shadow-brand/20",
                  )}
                >
                  <strong className="mb-1 flex items-center gap-2 text-[clamp(.75rem,1.8svh,1rem)]">
                    {Icon ? (
                      // FX-10: the highlight's icon, in the brand colour.
                      <Icon
                        aria-hidden
                        className="size-[1.15em] shrink-0 text-brand"
                        strokeWidth={1.75}
                      />
                    ) : null}
                    {highlight.title}
                  </strong>
                  <span className="block text-[clamp(.6875rem,1.6svh,.875rem)] leading-snug text-muted-foreground">
                    {highlight.text}
                  </span>
                </div>
              </QuotePortalReveal>
            );
          })}
        </ul>
      ) : null}
    </div>
  );

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn(
        "quote-print-hide dark relative flex min-h-svh items-center overflow-hidden pt-[76px] pb-5 text-foreground [@media(max-height:680px)]:pt-[64px] [@media(max-height:680px)]:pb-3 min-[1000px]:pt-24 min-[1000px]:pb-10",
        isAlternate ? "bg-surface" : "bg-background",
        PORTAL_STAGE_GLOW,
        // FX-07: a lit divider where one slide meets the next.
        fx(7) &&
          "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-brand/40 before:to-transparent",
      )}
    >
      {fx(6) ? (
        // FX-06: the slide's number, giant and faint, behind the copy.
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-[-6svh] font-black leading-none tracking-[-0.06em] text-foreground/[0.035] select-none text-[42svh] min-[1000px]:text-[52svh]",
            isMediaLeft ? "right-[2%]" : "left-[2%]",
            fx(28) && "qp-display",
          )}
        >
          {number}
        </span>
      ) : null}
      <div
        className={cn(
          "relative mx-auto grid w-[min(1160px,calc(100%-28px))] items-center gap-[clamp(1rem,2.6svh,2.25rem)] min-[641px]:w-[min(1160px,calc(100%-48px))] min-[1000px]:gap-12",
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
