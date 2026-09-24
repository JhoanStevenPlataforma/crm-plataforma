import { Check, Download } from "lucide-react";
import { useTranslate } from "ra-core";

import { Button } from "@/components/ui/button";

/**
 * The customer's three moves, at the foot of the sheet, under the figure they
 * answer. Accept and decline appear only while the payload offers them; print
 * is always there. Never printed: a button on paper is one nobody can press.
 *
 * The negative margins pull the bar to the card's edges — they mirror the
 * sheet's own padding in `PORTAL_SHEET_CLASS`.
 */
export const QuotePortalAnswerBar = ({
  canAccept,
  canReject,
  onAccept,
  onReject,
}: {
  canAccept: boolean;
  canReject: boolean;
  onAccept: () => void;
  onReject: () => void;
}) => {
  const translate = useTranslate();
  return (
    <div className="quote-print-hide -mx-6 -mb-6 flex flex-wrap gap-2.5 border-t bg-surface-muted px-6 py-5 sm:-mx-10 sm:-mb-10 sm:px-10">
      {canAccept ? (
        <Button
          className="rounded-xl bg-brand font-bold text-brand-foreground hover:bg-brand/90"
          onClick={onAccept}
        >
          <Check aria-hidden />
          {translate("resources.quotes.portal.accept")}
        </Button>
      ) : null}
      {canReject ? (
        <Button
          variant="outline"
          className="rounded-xl font-bold"
          onClick={onReject}
        >
          {translate("resources.quotes.portal.reject")}
        </Button>
      ) : null}
      <Button
        variant="outline"
        className="rounded-xl font-bold"
        onClick={() => window.print()}
      >
        <Download aria-hidden />
        {translate("resources.quotes.portal.print")}
      </Button>
    </div>
  );
};
