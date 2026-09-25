import { cn } from "@/lib/utils";

import { QuotePortalReveal } from "./QuotePortalReveal";
import { fx } from "./quotePortalFx";

/**
 * FX-14: where the last dark slide meets the light quotation, a fade instead
 * of a hard edge. A `.dark` layer — so it starts on the dark palette's own
 * ground — masked out towards the bottom, where the page's light ground
 * shows through. Tokens on both ends, no colour written twice.
 */
export const QuotePortalStageFade = () =>
  fx(14) ? (
    <div
      aria-hidden
      className="quote-print-hide relative h-40 min-[1000px]:h-64"
    >
      <div className="dark absolute inset-0 bg-background [mask-image:linear-gradient(to_bottom,black_0%,black_8%,rgb(0_0_0/.88)_28%,rgb(0_0_0/.62)_50%,rgb(0_0_0/.3)_72%,rgb(0_0_0/.08)_90%,transparent_100%)]" />
    </div>
  ) : null;

/**
 * The quotation's own heading: eyebrow, title and the sentence naming the
 * customer. Never printed — the sheet carries its own header.
 */
export const QuotePortalQuotationIntro = ({
  titleId,
  eyebrow,
  heading,
  intro,
  number,
}: {
  titleId: string;
  eyebrow: string;
  heading: string;
  intro: string;
  /** The quotation's number, drawn huge and faint behind the heading. */
  number: string;
}) => (
  <QuotePortalReveal className="quote-print-hide relative">
    {fx(15) ? (
      // FX-15: the quotation's number, giant and faint, behind the heading.
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-20 right-0 hidden text-[clamp(3rem,8vw,7.5rem)] leading-none font-black tracking-[-0.05em] whitespace-nowrap text-foreground/[0.035] select-none min-[1000px]:block",
          fx(28) && "qp-display",
        )}
      >
        {number}
      </span>
    ) : null}
    <p className="relative mb-4.5 flex items-center gap-3 text-[11px] font-bold tracking-[0.2em] text-brand uppercase">
      {fx(15) ? (
        // FX-15: the same amber rule the slides' eyebrows carry.
        <span
          aria-hidden
          className="h-px w-7 origin-left scale-x-0 bg-brand transition-transform delay-300 duration-700 group-data-[shown=true]:scale-x-100"
        />
      ) : null}
      <span>{eyebrow}</span>
    </p>
    <h2
      id={titleId}
      className={cn(
        "relative mb-2.5 text-[clamp(2.375rem,5vw,3.875rem)] leading-none font-bold tracking-[-0.05em]",
        fx(28) && "qp-display tracking-[-0.035em]", // FX-28
      )}
    >
      {heading}
    </h2>
    <p className="relative max-w-[650px] leading-relaxed text-muted-foreground">
      {intro}
    </p>
  </QuotePortalReveal>
);
