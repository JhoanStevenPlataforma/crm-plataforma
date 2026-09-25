import { useTranslate } from "ra-core";

import { cn } from "@/lib/utils";

import type { QuotePortalPayload } from "./quotePortalClient";

type StampKind = "open" | "accepted" | "rejected" | "superseded" | "expired";

const TONES: Record<StampKind, string> = {
  open: "border-brand text-brand outline-brand/60",
  accepted: "border-success text-success outline-success/60",
  rejected: "border-destructive text-destructive outline-destructive/60",
  superseded:
    "border-muted-foreground text-muted-foreground outline-muted-foreground/50",
  expired:
    "border-muted-foreground text-muted-foreground outline-muted-foreground/50",
};

/** Today as `YYYY-MM-DD` in the reader's own calendar, like `valid_until`. */
const localToday = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * What the stamp says: only what the sheet already states in words (an
 * acceptance, a refusal, a newer version, the validity date), read in that
 * order. It decides nothing — the server's answer rules stay the only rules.
 */
const stampKindOf = (payload: QuotePortalPayload): StampKind => {
  if (payload.acceptance.accepted_at) return "accepted";
  if (payload.acceptance.rejected_at) return "rejected";
  if (payload.quote.is_superseded) return "superseded";
  const validUntil = payload.quote.valid_until?.slice(0, 10);
  if (validUntil && validUntil < localToday()) return "expired";
  return "open";
};

/**
 * FX-19: a rubber stamp, tilted, in the empty middle of the sheet's header —
 * the way a stamped paper says where it stands before anyone reads it.
 * Decoration over the sheet, so `aria-hidden` (the sheet says the same in
 * words) and never printed (the PDF is the document, not a picture of it).
 */
export const QuotePortalStamp = ({
  payload,
}: {
  payload: QuotePortalPayload;
}) => {
  const translate = useTranslate();
  const kind = stampKindOf(payload);
  return (
    <span
      aria-hidden
      className={cn(
        "quote-print-hide pointer-events-none absolute top-11 left-[40%] z-10 hidden -rotate-12 rounded-lg border-[3px] px-4 py-1.5 text-sm font-black tracking-[0.25em] uppercase opacity-80 outline-1 outline-offset-[3px] mix-blend-multiply outline-solid select-none sm:block dark:mix-blend-screen",
        TONES[kind],
      )}
    >
      {translate(`resources.quotes.portal.landing.stamp.${kind}`)}
    </span>
  );
};
