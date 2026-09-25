import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
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
 * `spotlight` renders the card in ink with an amber glow -- the portal's
 * cover, at the size of a card. Use it for the ONE figure a screen leads with;
 * two spotlights on a row cancel each other out.
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
  spotlight = false,
  delta,
  trend,
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
  spotlight?: boolean;
  /**
   * The change against a comparable earlier stretch, already worded
   * ("+12%", "+$57.1K", "+10 pts"). `tone` says whether the move is good for
   * the business — an arrow up is not always good news.
   */
  delta?: {
    text: string;
    direction: "up" | "down" | "flat";
    tone: "good" | "bad" | "neutral";
    /** What it is compared with, e.g. "vs. last month". */
    basis: string;
    /** The comparison spelled out, shown on hover. */
    basisHint?: string;
  };
  /** A small trend line beside the value; see `Sparkline`. */
  trend?: ReactNode;
}) => (
  // `h-full` plus a growing body: a longer label wraps its badge onto a second
  // line, and without this the footers of a row of cards no longer line up —
  // which reads as the cards saying different KINDS of thing.
  // Lifts on hover: the card is the entry point to the figure's detail, and
  // the raise is what says so before the pointer finds the link inside it.
  <Card
    className={cn(
      "group/kpi relative isolate flex h-full flex-col gap-0 overflow-hidden py-0 transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-raised",
      // The ink ground reuses the sidebar tokens, which are dark in both
      // themes; every text colour inside is switched to that ramp with it.
      spotlight &&
        "border-sidebar-border bg-sidebar text-sidebar-accent-foreground shadow-raised",
    )}
  >
    {spotlight ? (
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 -z-10 size-48 rounded-full bg-sidebar-primary/25 blur-3xl"
      />
    ) : null}
    <div className="flex flex-1 flex-col justify-between gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={cn(
              "text-[0.6875rem] font-semibold uppercase tracking-[0.1em]",
              spotlight ? "text-sidebar-primary" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
          {badge}
        </div>
        {Icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors",
              spotlight
                ? "bg-sidebar-primary/15 text-sidebar-primary ring-sidebar-primary/25"
                : "bg-brand-tint text-brand ring-brand/15 group-hover/kpi:bg-brand group-hover/kpi:text-brand-foreground",
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <p
            className={cn(
              // `tabular-nums` so a row of cards keeps its digits aligned and the
              // value does not shift width as it updates.
              "text-[1.875rem] leading-none font-semibold tabular-nums tracking-[-0.03em]",
              tone === "alert" && "text-destructive",
            )}
          >
            {value}
          </p>
          {trend ? <div className="h-8 w-24 shrink-0">{trend}</div> : null}
        </div>
        {delta ? <DeltaChip delta={delta} spotlight={spotlight} /> : null}
        {progress != null ? (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
            role="presentation"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                tone === "alert"
                  ? "bg-destructive"
                  : "bg-[linear-gradient(90deg,var(--brand-subtle),var(--brand))]",
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
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-t px-4 py-2 text-xs tabular-nums",
          spotlight
            ? "border-sidebar-border bg-black/15 text-sidebar-foreground"
            : "border-border/70 bg-surface-muted/70 text-muted-foreground",
        )}
      >
        <span className="min-w-0 truncate">{footerPrimary}</span>
        {footerSecondary ? (
          <span className="shrink-0 text-right">{footerSecondary}</span>
        ) : null}
      </div>
    ) : null}
  </Card>
);

const DELTA_ICONS = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: ArrowRight,
} as const;

const DeltaChip = ({
  delta,
  spotlight,
}: {
  delta: NonNullable<Parameters<typeof KpiCard>[0]["delta"]>;
  spotlight: boolean;
}) => {
  const Icon = DELTA_ICONS[delta.direction];
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs">
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums",
          delta.tone === "good" && "bg-success/12 text-success",
          delta.tone === "bad" && "bg-destructive/12 text-destructive",
          delta.tone === "neutral" &&
            (spotlight
              ? "bg-white/10 text-sidebar-foreground"
              : "bg-muted text-muted-foreground"),
        )}
      >
        <Icon className="size-3" />
        {delta.text}
      </span>
      <span
        title={delta.basisHint}
        className={cn(
          "truncate",
          spotlight ? "text-sidebar-foreground" : "text-muted-foreground",
        )}
      >
        {delta.basis}
      </span>
    </p>
  );
};
