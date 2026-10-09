import { useRecordContext, useTranslate } from "ra-core";

import { Label } from "@/components/ui/label";

import { EntityEmailsPanel } from "../emails/EntityEmailsPanel";
import type { QuoteSummary } from "../types";

/**
 * The quotation by mail: send the customer its link, and see every time it was
 * sent (docs/proposals/outbound-email.md).
 *
 * Sending is offered once something has been issued -- there is nothing to
 * share before -- and the dialog itself says when the issued version cannot be
 * shared today (a revision is open, the offer lapsed, the quotation is closed).
 * It never issues: that stays the "Send" move of the status machine.
 */
export const QuoteEmailsPanel = () => {
  const quote = useRecordContext<QuoteSummary>();
  const translate = useTranslate();
  if (!quote) return null;

  return (
    <section className="flex w-full flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium">
          {translate("crm.email.history.title")}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate("crm.email.history.quote_hint")}
        </p>
      </div>
      <EntityEmailsPanel
        entityType="quote"
        entityId={quote.id}
        sendLabel="crm.email.action.send_quote"
        canSend={(quote.nb_issued_versions ?? 0) > 0}
      />
    </section>
  );
};
