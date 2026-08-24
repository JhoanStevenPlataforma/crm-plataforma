import { useTranslate } from "ra-core";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * The frame every chart on these screens sits in.
 *
 * Extracted so the empty state is written once. It matters more than it looks:
 * a chart with no data must say so, because an empty plot area reads as "zero"
 * and zero is a claim about the business, not about the query.
 */
export const TeamChartCard = ({
  title,
  isEmpty,
  emptyLabel,
  children,
  height = 280,
}: {
  title: string;
  isEmpty: boolean;
  /** Defaults to the shared "nothing to report in this period" message. */
  emptyLabel?: string;
  children: ReactNode;
  height?: number;
}) => {
  const translate = useTranslate();

  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {isEmpty ? (
          <p className="text-sm text-muted-foreground py-8">
            {emptyLabel ?? translate("crm.teams_dashboard.no_stats")}
          </p>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
};
