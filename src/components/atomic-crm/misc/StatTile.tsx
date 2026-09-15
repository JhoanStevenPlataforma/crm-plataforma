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
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "alert" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );

  if (!to) {
    return (
      <Card>
        <CardContent className="p-4">{body}</CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-0">
        <Link
          to={to}
          className="flex flex-col p-4 no-underline text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 rounded-xl"
        >
          {body}
        </Link>
      </CardContent>
    </Card>
  );
};
