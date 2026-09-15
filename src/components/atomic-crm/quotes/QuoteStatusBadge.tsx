import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { QuoteStatusKey } from "../types";

/**
 * Where a quotation stands, as a dot and a word (quotes §3).
 *
 * The dot carries the state and the word names it, so a list is scannable
 * without being a colour puzzle and still reads for someone who cannot separate
 * the hues. The colours are the SEMANTIC tokens, never the brand hue and never
 * `quote_statuses.color` — that column is a hex value, and the design system's
 * one rule is that colours are tokens (`ui-redesign.md`). An installation that
 * renames a status keeps its label, which comes from the database; one that
 * ADDS a status falls through to the neutral dot rather than being handed a
 * meaning this file cannot know.
 */
const DOT_BY_STATUS: Record<string, string> = {
  draft: "bg-muted-foreground",
  pending_approval: "bg-warning",
  approved: "bg-info",
  sent: "bg-info",
  viewed: "bg-info",
  under_review: "bg-warning",
  negotiating: "bg-warning",
  accepted: "bg-success",
  rejected: "bg-destructive",
  expired: "bg-destructive",
  canceled: "bg-muted-foreground",
};

export const QuoteStatusBadge = ({
  statusKey,
  label,
}: {
  statusKey?: QuoteStatusKey | string | null;
  label?: string | null;
}) => {
  if (!statusKey) return null;

  return (
    <Badge variant="outline" className="gap-1.5 font-normal whitespace-nowrap">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          DOT_BY_STATUS[statusKey] ?? "bg-muted-foreground",
        )}
        aria-hidden="true"
      />
      {label ?? statusKey}
    </Badge>
  );
};
