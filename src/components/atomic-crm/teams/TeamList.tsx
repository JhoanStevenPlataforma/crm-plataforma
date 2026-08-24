import { BarChart3 } from "lucide-react";
import { useTranslate } from "ra-core";
import { Link } from "react-router";

import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Button } from "@/components/ui/button";

import { TopToolbar } from "../layout/TopToolbar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Team } from "../types";
import { TEAMS_DASHBOARD_PATH } from "./teamsDashboardPath";
import { attainmentRatio, formatAttainment, formatMoney } from "./teamBudget";

const TeamListActions = () => {
  const translate = useTranslate();
  return (
    <TopToolbar>
      <Button variant="outline" size="sm" asChild>
        <Link to={TEAMS_DASHBOARD_PATH}>
          <BarChart3 className="h-4 w-4" />
          {translate("resources.teams.action.dashboard")}
        </Link>
      </Button>
      <CreateButton label="resources.teams.action.new" />
    </TopToolbar>
  );
};

const filters = [<SearchInput source="q" alwaysOn />];

/**
 * Teams (proposal §3.2, deliverable 2.4).
 *
 * Every number here comes from `teams_summary`, which the data provider serves
 * in place of `teams` on reads: scalar subqueries in the view, never a count or
 * a sum fetched per row from the client. They are computed columns, so they
 * carry `disableSort` — PostgREST cannot order on them.
 */
export function TeamList() {
  const { currency } = useConfigurationContext();

  return (
    <List
      filters={filters}
      actions={<TeamListActions />}
      sort={{ field: "name", order: "ASC" }}
    >
      <DataTable>
        <DataTable.Col source="name" />
        <DataTable.Col source="description" />
        <DataTable.NumberCol source="nb_members" />
        <DataTable.Col<Team>
          source="budget_amount"
          disableSort
          render={(team) =>
            // An unset budget is not a budget of zero: say so.
            team.budget_amount == null
              ? "—"
              : formatMoney(team.budget_amount, currency)
          }
        />
        <DataTable.Col<Team>
          source="won_amount"
          disableSort
          render={(team) => formatMoney(team.won_amount, currency)}
        />
        <DataTable.Col<Team>
          source="attainment"
          disableSort
          render={(team) =>
            formatAttainment(
              attainmentRatio(team.won_amount, team.budget_amount),
            )
          }
        />
      </DataTable>
    </List>
  );
}
