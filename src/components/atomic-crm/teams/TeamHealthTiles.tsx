import { useTranslate } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Team } from "../types";
import { formatMoney } from "./teamBudget";
import {
  formatCoverage,
  formatGap,
  paceOf,
  pipelineCoverage,
  winRate,
} from "./teamPace";
import { formatAttainment } from "./teamBudget";
import { StatTile } from "./TeamStatTile";
import { onTimeRate, workloadOf } from "./taskWorkload";

/**
 * The figures that turn the dashboard's totals into a judgement.
 *
 * Everything here is arithmetic over columns `teams_summary` already returns —
 * no extra request — which is why it is a component and not a query. Attainment
 * alone cannot say whether a period is going well: 45% of target is excellent
 * in March and alarming in November, and the dashboard used to render both the
 * same way.
 */
export const TeamHealthTiles = ({ team }: { team: Team }) => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();

  const pace = paceOf(team);
  const coverage = pipelineCoverage(team);
  const rate = winRate(team.nb_won, team.nb_lost);

  return (
    <>
      {/* The gap against the calendar, not against zero. `alert` is reserved
          for a team that is genuinely behind pace — colouring every imperfect
          number would make the colour mean nothing. */}
      <StatTile
        label={translate("crm.teams_dashboard.pace")}
        value={formatGap(pace.gap)}
        hint={translate(`crm.teams_dashboard.pace_${pace.status}`)}
        tone={pace.status === "behind" ? "alert" : "default"}
      />
      <StatTile
        label={translate("crm.teams_dashboard.coverage")}
        value={formatCoverage(coverage)}
        hint={
          coverage == null
            ? undefined
            : translate("crm.teams_dashboard.coverage_hint")
        }
      />
      <StatTile
        label={translate("crm.teams_dashboard.win_rate")}
        value={formatAttainment(rate)}
        hint={
          rate == null
            ? undefined
            : translate("crm.teams_dashboard.decided_deals", {
                won: team.nb_won ?? 0,
                lost: team.nb_lost ?? 0,
              })
        }
      />
      <StatTile
        label={translate("crm.teams_dashboard.lost")}
        value={formatMoney(team.lost_amount, currency)}
      />
    </>
  );
};

/**
 * The workload side, for a team row or a roster row.
 *
 * Reads through `workloadOf` rather than off the record, so the overdue tasks
 * are subtracted out of the pending count exactly once and in the same place
 * the charts do it.
 */
export const TeamWorkloadTiles = ({
  source,
}: {
  source: Parameters<typeof workloadOf>[0] & {
    nb_tasks_completed_on_time?: number;
  };
}) => {
  const translate = useTranslate();
  const workload = workloadOf(source);
  const rate = onTimeRate(
    source.nb_tasks_completed,
    source.nb_tasks_completed_on_time,
  );

  return (
    <>
      <StatTile
        label={translate("crm.teams_dashboard.tasks_pending")}
        value={String(workload.pending)}
        hint={
          workload.dueSoon > 0
            ? translate("crm.teams_dashboard.tasks_due_soon_hint", {
                count: workload.dueSoon,
              })
            : undefined
        }
      />
      <StatTile
        label={translate("crm.teams_dashboard.tasks_overdue")}
        value={String(workload.overdue)}
        tone={workload.overdue > 0 ? "alert" : "default"}
      />
      <StatTile
        label={translate("crm.teams_dashboard.tasks_completed")}
        value={String(workload.completed)}
      />
      {/* Rendered only where the on-time counter exists: it is a roster column,
          and a blank tile is worse than one tile fewer. */}
      {source.nb_tasks_completed_on_time === undefined ? null : (
        <StatTile
          label={translate("crm.teams_dashboard.on_time_rate")}
          value={formatAttainment(rate)}
        />
      )}
    </>
  );
};
