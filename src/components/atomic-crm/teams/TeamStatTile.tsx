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
 */
export const StatTile = ({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "alert";
}) => (
  <Card>
    <CardContent className="p-4">
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
    </CardContent>
  </Card>
);
