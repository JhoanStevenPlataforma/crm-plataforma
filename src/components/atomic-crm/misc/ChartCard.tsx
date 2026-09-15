import { useTranslate } from "ra-core";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * The frame every chart on a reporting screen sits in.
 *
 * Extracted so the empty state is written once. It matters more than it looks:
 * a chart with no data must say so, because an empty plot area reads as "zero"
 * and zero is a claim about the business, not about the query.
 *
 * `subtitle` carries the date basis ("by expected closing date", "by completion
 * month"). It is not decoration: two charts on one screen measured on different
 * dates, both captioned only "this quarter", is the fastest way for a dashboard
 * to lose its reader's trust.
 */
export const ChartCard = ({
  title,
  subtitle,
  isEmpty,
  emptyLabel,
  children,
  height = 280,
}: {
  title: string;
  subtitle?: string;
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
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium">{title}</h2>
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {isEmpty ? (
          <p className="text-sm text-muted-foreground py-8">
            {emptyLabel ?? translate("crm.analytics.no_data")}
          </p>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
};
