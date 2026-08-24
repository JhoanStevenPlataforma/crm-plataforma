import { useGetList, useRecordContext, useTranslate } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Team, TeamBudget } from "../types";
import { formatMoney } from "./teamBudget";

/**
 * Every budget period the team has had.
 *
 * Read-only on purpose. The vigente period is edited through the form above —
 * one obvious place to change the current target — while past periods are the
 * record of what was promised at the time and should not be quietly rewritten.
 * A new period is opened by changing the dates in the form, which appends here.
 */
export const TeamBudgetHistory = () => {
  const team = useRecordContext<Team>();
  const translate = useTranslate();
  const { currency } = useConfigurationContext();

  const { data: budgets, isPending } = useGetList<TeamBudget>(
    "team_budgets",
    {
      filter: { team_id: team?.id },
      sort: { field: "period_start", order: "DESC" },
      pagination: { page: 1, perPage: 50 },
    },
    { enabled: team?.id != null },
  );

  if (!team || isPending) return null;

  return (
    <div className="flex flex-col gap-3 w-full">
      <h3 className="text-sm font-medium">
        {translate("resources.teams.budget.history")}
      </h3>

      {(budgets ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("resources.teams.budget.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {(budgets ?? []).map((budget) => (
            <li key={budget.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-muted-foreground">
                {budget.period_start} → {budget.period_end}
              </span>
              <span className="font-medium tabular-nums">
                {formatMoney(budget.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
