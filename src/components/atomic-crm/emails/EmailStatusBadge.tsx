import { useTranslate } from "ra-core";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { EmailStatus } from "../types";

/**
 * How a message's delivery stands, as a dot and a word
 * (docs/proposals/outbound-email.md).
 *
 * The distinctions are the point: `accepted` (the provider took it) is not
 * `delivered` (the mailbox did), and `simulated` is neither -- it gets the
 * warning dot, because the one thing this badge must never suggest is that a
 * mail left when it did not. Semantic tokens, like `QuoteStatusBadge`.
 */
const DOT_BY_STATUS: Record<EmailStatus, string> = {
  pending: "bg-muted-foreground",
  processing: "bg-info",
  accepted: "bg-info",
  delivered: "bg-success",
  bounced: "bg-destructive",
  failed: "bg-destructive",
  canceled: "bg-muted-foreground",
  simulated: "bg-warning",
};

export const EmailStatusBadge = ({ status }: { status: EmailStatus }) => {
  const translate = useTranslate();

  return (
    <Badge variant="outline" className="gap-1.5 font-normal whitespace-nowrap">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          DOT_BY_STATUS[status] ?? "bg-muted-foreground",
        )}
        aria-hidden="true"
      />
      {translate(`crm.email.status.${status}`)}
    </Badge>
  );
};
