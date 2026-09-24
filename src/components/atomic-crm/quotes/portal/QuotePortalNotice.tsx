import { useTranslate } from "ra-core";

import { cn } from "@/lib/utils";

/**
 * What stands between the customer and an answer, said once above the sheet:
 * a link that stopped working, the answer just given, or an offer that can no
 * longer be answered online. Settled offers need no notice — the paper says so.
 */
export const QuotePortalNotice = ({
  isLinkClosed,
  answered,
  isUnanswerable,
  ownerName,
}: {
  isLinkClosed: boolean;
  answered: "accepted" | "rejected" | null;
  isUnanswerable: boolean;
  ownerName: string | null;
}) => {
  const translate = useTranslate();
  const base = "quote-print-hide rounded-xl border px-4 py-3 text-sm";

  if (isLinkClosed) {
    return (
      <p role="status" className={cn(base, "border-warning bg-warning/10")}>
        {translate("resources.quotes.portal.live.link_closed")}
      </p>
    );
  }
  if (answered) {
    return (
      <p role="status" className={cn(base, "border-success bg-success/10")}>
        {translate(
          answered === "accepted"
            ? "resources.quotes.portal.accepted_notice"
            : "resources.quotes.portal.rejected_notice",
        )}
      </p>
    );
  }
  if (isUnanswerable) {
    return (
      <p role="status" className={cn(base, "bg-card text-muted-foreground")}>
        {ownerName
          ? translate("resources.quotes.portal.closed", { name: ownerName })
          : translate("resources.quotes.portal.closed_anonymous")}
      </p>
    );
  }
  return null;
};
