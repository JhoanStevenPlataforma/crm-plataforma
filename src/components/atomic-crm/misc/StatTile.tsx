import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One figure on a team or member screen.
 *
 * Shared by the dashboard and both drill-downs so a number never changes shape
 * on the way from the overview to the detail — the manager should be able to
 * recognise the same figure without re-reading its label.
 *
 * `tone="alert"` is for a value that is a problem in itself (a target handed
 * out twice over), not merely a low one: colouring every bad number would make
 * the colour mean nothing.
 *
 * `to` turns the tile into the entry point of a drill-down: the summary is
 * where a problem is noticed, and the link is what carries the reader to where
 * it can be taken apart, with the period they were already looking at. A tile
 * without one stays a plain figure — most of them are, and making every number
 * look clickable would devalue the ones that lead somewhere.
 */
export const StatTile = ({
  label,
  value,
  hint,
  tone = "default",
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "alert";
  /** Where this figure is explained. Renders the whole tile as a link. */
  to?: string;
}) => {
  const body = (
    <>
      <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-[1.625rem] leading-none font-semibold tracking-[-0.025em] tabular-nums",
          tone === "alert" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </>
  );

  if (!to) {
    return (
      <Card className="h-full gap-0 py-0">
        <CardContent className="flex flex-col p-4">{body}</CardContent>
      </Card>
    );
  }

  // A tile that leads somewhere says so: it lifts on hover and shows the
  // arrow, so the reader can tell it from the plain figures around it.
  return (
    <Card className="group/tile h-full gap-0 py-0 transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-raised">
      <CardContent className="p-0">
        <Link
          to={to}
          className="relative flex flex-col rounded-xl p-4 text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ArrowUpRight className="absolute top-3.5 right-3.5 size-3.5 text-muted-foreground transition-colors group-hover/tile:text-brand" />
          {body}
        </Link>
      </CardContent>
    </Card>
  );
};
