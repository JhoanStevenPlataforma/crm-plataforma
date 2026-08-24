import type { TeamDealStat } from "../../../types";
import type { Db } from "./types";

/**
 * Demo-mode stand-in for the `team_deal_stats` view: one row per team, member,
 * month and stage.
 *
 * Computed once, after the deals exist, like the other view stand-ins in this
 * folder. It mirrors the view's scoping deliberately — the team's current
 * budget period, falling back to the calendar year — because the drill-down
 * charts are supposed to reconcile with the header above them, and a demo where
 * they do not would read as a bug in the real backend.
 */
const calendarYearBounds = () => {
  const year = new Date().getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
};

export const generateTeamDealStats = (db: Db): TeamDealStat[] => {
  const byKey = new Map<string, TeamDealStat>();
  const fallback = calendarYearBounds();

  db.deals.forEach((deal) => {
    if (deal.team_id == null || !deal.expected_closing_date) return;
    // The view never counts archived deals, so neither does this.
    if (deal.archived_at) return;

    const budget = db.team_budgets.find((b) => b.team_id === deal.team_id);
    const start = budget?.period_start ?? fallback.start;
    const end = budget?.period_end ?? fallback.end;
    if (
      deal.expected_closing_date < start ||
      deal.expected_closing_date > end
    ) {
      return;
    }

    const month = `${deal.expected_closing_date.slice(0, 7)}-01`;
    const salesId = deal.sales_id ?? null;
    const id = `${deal.team_id}-${salesId ?? 0}-${month.slice(0, 7)}-${deal.stage}`;

    const row = byKey.get(id) ?? {
      id,
      team_id: deal.team_id,
      sales_id: salesId,
      month,
      stage: deal.stage,
      nb_deals: 0,
      amount: 0,
    };

    byKey.set(id, {
      ...row,
      nb_deals: row.nb_deals + 1,
      amount: row.amount + (deal.amount ?? 0),
    });
  });

  return [...byKey.values()].sort((a, b) => a.month.localeCompare(b.month));
};
