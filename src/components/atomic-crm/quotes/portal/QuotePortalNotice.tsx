import { useTranslate } from "ra-core";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What stands between the customer and an answer, said once above the sheet:
 * a link that stopped working, the answer just given, an older version chosen
 * in the selector, a new version being prepared, or an offer that can no longer
 * be answered online. Settled offers need no notice — the paper says so.
 */
export const QuotePortalNotice = ({
  isLinkClosed,
  answered,
  olderVersion,
  isBeingRevised,
  isUnanswerable,
  ownerName,
  onShowCurrent,
}: {
  isLinkClosed: boolean;
  answered: "accepted" | "rejected" | null;
  /**
   * Set while the customer reads a version the selector offers as history:
   * the one on screen and the one on offer.
   */
  olderVersion: { shown: number; current: number } | null;
  /** The team reopened the quotation and is preparing a new version. */
  isBeingRevised: boolean;
  isUnanswerable: boolean;
  ownerName: string | null;
  onShowCurrent: () => void;
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
  if (olderVersion) {
    return (
      <div
        role="status"
        className={cn(
          base,
          "flex flex-wrap items-center justify-between gap-2 border-info bg-info-tint",
        )}
      >
        <span>
          {translate("resources.quotes.portal.versions.older_notice", {
            shown: olderVersion.shown,
            current: olderVersion.current,
          })}
        </span>
        <Button size="sm" variant="outline" onClick={onShowCurrent}>
          {translate("resources.quotes.portal.versions.show_current", {
            number: olderVersion.current,
          })}
        </Button>
      </div>
    );
  }
  if (isBeingRevised) {
    return (
      <p role="status" className={cn(base, "bg-card text-muted-foreground")}>
        {ownerName
          ? translate("resources.quotes.portal.versions.revising", {
              name: ownerName,
            })
          : translate("resources.quotes.portal.versions.revising_anonymous")}
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
