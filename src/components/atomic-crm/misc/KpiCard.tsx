import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One headline figure, with the two facts that keep it honest.
 *
 * The anatomy is deliberate. A number on its own invites the wrong question:
 * "$1.4M" says nothing about whether that is 3 deals or 300, or what it is
 * weighted at. So every card carries a footer with the count and the basis, and
 * a reader who wants to challenge the figure has what they need without opening
 * another screen.
 *
 * `tone` colours only the value, and only for a state that is a problem in
 * itself — work already late, not merely a low number. Colouring every
 * unfavourable figure is how a palette stops meaning anything.
 *
 * The richer sibling of `StatTile`, which stays for dense grids (the team
 * dashboard puts eight figures in a row and has no space for footers).
 */
export const KpiCard = ({
  label,
  value,
  icon: Icon,
  badge,
  footerPrimary,
  footerSecondary,
  progress,
  tone = "default",
}: {
  /** Short, uppercase in render. Names the measure, not the screen. */
  label: string;
  value: string;
  icon?: LucideIcon;
  /** A state worth interrupting for, e.g. "2 urgent". Rendered beside the label. */
  badge?: ReactNode;
  /** The count or composition behind the value. */
  footerPrimary?: ReactNode;
  /** The basis: what date, what filter, what denominator. */
  footerSecondary?: ReactNode;
  /**
   * A share of a whole, 0..1, drawn as a bar under the value.
   *
   * Only pass it when the figure genuinely IS a part of something — a count
   * against a total, an attainment against a target. A bar under an absolute
   * number invents a denominator, and the reader will try to guess it.
   */
  progress?: number | null;
  tone?: "default" | "alert";
}) => (
  // `h-full` plus a growing body: a longer label wraps its badge onto a second
  // line, and without this the footers of a row of cards no longer line up —
  // which reads as the cards saying different KINDS of thing.
  <Card className="flex h-full flex-col gap-0 overflow-hidden py-0">
    <div className="flex flex-1 flex-col justify-between gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {label}
          </span>
          {badge}
        </div>
        {Icon ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-surface-muted text-muted-foreground">
            <Icon className="size-3.5" />
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p
          className={cn(
            // `tabular-nums` so a row of cards keeps its digits aligned and the
            // value does not shift width as it updates.
            "text-2xl font-semibold tabular-nums tracking-tight",
            tone === "alert" && "text-destructive",
          )}
        >
          {value}
        </p>
        {progress != null ? (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
            role="presentation"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                tone === "alert" ? "bg-destructive" : "bg-brand",
              )}
              // Clamped: a share above 1 overflows the track, and a negative
              // one renders as an empty bar, which reads as a true zero.
              style={{
                width: `${Math.min(100, Math.max(0, progress * 100))}%`,
              }}
            />
          </div>
        ) : null}
      </div>
    </div>

    {footerPrimary || footerSecondary ? (
      <div className="flex items-center justify-between gap-2 border-t bg-surface-muted px-4 py-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{footerPrimary}</span>
        {footerSecondary ? (
          <span className="shrink-0 text-right">{footerSecondary}</span>
        ) : null}
      </div>
    ) : null}
  </Card>
);
