import { cn } from "@/lib/utils";

import { fx } from "./quotePortalFx";

/** The sheet as it was before the refinements; the base every one adds to. */
const BASE =
  "gap-8 p-6 sm:p-10 [&>header]:-mx-6 [&>header]:border-b [&>header]:px-6 [&>header]:pb-8 sm:[&>header]:-mx-10 sm:[&>header]:px-10 print:shadow-none print:[&>header]:mx-0 print:[&>header]:px-0 [&>h3]:rounded-2xl [&>h3]:border [&>h3]:border-brand/25 [&>h3]:bg-brand-tint [&>h3]:px-5 [&>h3]:py-4 [&>h3]:text-sm [&>h3]:text-brand-strong [&_.quote-total]:mt-3 [&_.quote-total]:rounded-xl [&_.quote-total]:border-0 [&_.quote-total]:bg-brand-tint [&_.quote-total]:p-4 [&_.quote-total]:font-extrabold [&_dl]:max-w-sm [&_table]:text-[13px] [&_td]:py-4 [&_th]:py-3";

/**
 * The sheet as the portal presents it. Classes on the shared `QuoteDocument`,
 * never a copy of it — the customer's copy and the rep's PDF must stay one
 * document — and every refinement is undone on paper (`print:`).
 */
export const portalSheetClass = (): string =>
  cn(
    BASE,
    fx(20)
      ? // FX-20: a deeper shadow and rounder corners: a sheet floating.
        "rounded-[28px] shadow-[0_40px_100px_-30px] shadow-foreground/25"
      : "rounded-3xl shadow-2xl shadow-foreground/5",
    // FX-16: an amber letterhead strip across the top of the card.
    fx(16) &&
      "relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:bg-gradient-to-r before:from-brand before:via-brand-subtle before:to-brand print:before:hidden",
    // FX-17: every other line of the table on a faint tint.
    fx(17) &&
      "[&_tbody_tr:nth-child(even)]:bg-surface-muted print:[&_tbody_tr:nth-child(even)]:bg-transparent [&_td:first-child]:pl-3 [&_th:first-child]:pl-3",
    fx(18)
      ? // FX-18: the figure the customer answers, larger and lit.
        "[&_.quote-total]:py-5 [&_.quote-total]:text-2xl [&_.quote-total]:shadow-[0_14px_40px_-14px] [&_.quote-total]:shadow-brand/50 print:[&_.quote-total]:py-4 print:[&_.quote-total]:text-lg print:[&_.quote-total]:shadow-none"
      : "[&_.quote-total]:text-lg",
  );
