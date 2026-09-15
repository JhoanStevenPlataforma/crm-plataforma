import { useTranslate } from "ra-core";
import type { ComponentProps } from "react";

import { ChartCard } from "../misc/ChartCard";

/**
 * `ChartCard` with this dashboard's own empty-state wording.
 *
 * The generic card moved to `misc/` when the analytics module started drawing
 * the same charts. Only the default empty label was ever team-specific, so that
 * is all that stayed here — the eight callers in this folder are unchanged.
 */
export const TeamChartCard = (props: ComponentProps<typeof ChartCard>) => {
  const translate = useTranslate();

  return (
    <ChartCard
      {...props}
      emptyLabel={props.emptyLabel ?? translate("crm.teams_dashboard.no_stats")}
    />
  );
};
