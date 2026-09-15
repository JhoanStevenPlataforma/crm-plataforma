import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The frame a non-chart panel sits in.
 *
 * The sibling of `ChartCard`, which owns the same header but adds a fixed plot
 * height and an empty state. Extracted because the dashboard's four panels each
 * carried their own header markup — a 20px muted heading beside a 24px icon —
 * which made every panel title compete with the page title for weight, and
 * meant restyling headers was a four-file edit.
 *
 * `action` is the slot for the one control a panel owns (add a task, add a
 * contact). It sits in the header rather than floating over the content so a
 * panel with an action and one without still line up.
 */
export const SectionCard = ({
  title,
  subtitle,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  /** The basis of the figures, when it would otherwise be ambiguous. */
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** For panels whose content must reach the card's edge, e.g. a list. */
  contentClassName?: string;
}) => (
  <Card className={cn("gap-0 py-0 overflow-hidden", className)}>
    <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <h2 className="text-sm font-semibold truncate">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 -my-1">{action}</div> : null}
    </div>
    <CardContent className={cn("p-4", contentClassName)}>
      {children}
    </CardContent>
  </Card>
);
