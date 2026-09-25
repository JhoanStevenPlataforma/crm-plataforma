import { useCanAccess, useGetList, useTranslate } from "ra-core";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Sale, Team } from "../types";
import {
  ANALYTICS_PRESETS,
  analyticsFiltersToSearch,
  presetOf,
  rangeForPreset,
  type AnalyticsFilters,
} from "./analyticsFilters";
import { cn } from "@/lib/utils";

/** Enough for any realistic team, and the roster is tiny either way. */
const OPTIONS_PER_PAGE = 200;

/** The sentinel a Radix select needs, because "" is not a valid item value. */
const ANY = "any";

/**
 * The filter bar, shared by every tab.
 *
 * It writes to the URL rather than to a store, so a dashboard is something
 * people can send each other and a reload does not reset a manager's analysis.
 * The parsed object flows down from the layout; this component only ever pushes
 * a new query string.
 *
 * The OWNER control is rendered for admins and managers only. For a rep it
 * would be a no-op — row level security already restricts them to their own
 * rows, so changing it would change nothing on screen — and a control that
 * does nothing is worse than an absent one.
 *
 * The TEAM control is hidden on Productivity: tasks have no team column, and
 * resolving one through `team_members` would count a rep who is rostered in two
 * teams twice.
 */
export const AnalyticsFilterBar = ({
  filters,
  showTeam = true,
}: {
  filters: AnalyticsFilters;
  showTeam?: boolean;
}) => {
  const translate = useTranslate();
  const [, setSearchParams] = useSearchParams();

  // The same gate the teams dashboard uses: in this app "can edit teams" is
  // exactly "admin or manager".
  const { canAccess: canFilterByOwner } = useCanAccess({
    resource: "teams",
    action: "edit",
  });

  const { data: sales } = useGetList<Sale>(
    "sales",
    {
      sort: { field: "last_name", order: "ASC" },
      pagination: { page: 1, perPage: OPTIONS_PER_PAGE },
      filter: { "disabled@neq": true },
    },
    { enabled: canFilterByOwner === true },
  );

  const { data: teams } = useGetList<Team>(
    "teams",
    {
      sort: { field: "name", order: "ASC" },
      pagination: { page: 1, perPage: OPTIONS_PER_PAGE },
    },
    { enabled: showTeam },
  );

  const apply = (next: AnalyticsFilters) =>
    setSearchParams(analyticsFiltersToSearch(next), { replace: true });

  const activePreset = presetOf(filters);

  return (
    // One surface for the whole scope of the screen, so it reads as a single
    // control rather than five loose fields floating over the charts.
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-xl border border-border/80 bg-card p-3 shadow-card">
      <div className="flex flex-col gap-1">
        <span className="text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          {translate("crm.analytics.filters.period")}
        </span>
        <div className="flex h-9 flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {ANALYTICS_PRESETS.map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant="ghost"
              aria-pressed={activePreset === preset}
              className={cn(
                "h-8 rounded-md px-3 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground",
                activePreset === preset &&
                  "bg-card text-foreground shadow-card hover:bg-card",
              )}
              onClick={() => apply({ ...filters, ...rangeForPreset(preset) })}
            >
              {translate(`crm.analytics.presets.${preset}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {translate("crm.analytics.filters.from")}
          </span>
          <Input
            type="date"
            className="w-36"
            value={filters.from}
            max={filters.to}
            onChange={(event) =>
              event.target.value &&
              apply({ ...filters, from: event.target.value })
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {translate("crm.analytics.filters.to")}
          </span>
          <Input
            type="date"
            className="w-36"
            value={filters.to}
            min={filters.from}
            onChange={(event) =>
              event.target.value &&
              apply({ ...filters, to: event.target.value })
            }
          />
        </label>
      </div>

      {canFilterByOwner ? (
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {translate("crm.analytics.filters.owner")}
          </span>
          <Select
            value={filters.salesId == null ? ANY : String(filters.salesId)}
            onValueChange={(value) =>
              apply({
                ...filters,
                salesId: value === ANY ? null : Number(value),
              })
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>
                {translate("crm.analytics.filters.all_owners")}
              </SelectItem>
              {(sales ?? []).map((sale) => (
                <SelectItem key={sale.id} value={String(sale.id)}>
                  {`${sale.first_name} ${sale.last_name}`.trim()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      ) : null}

      {showTeam ? (
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {translate("crm.analytics.filters.team")}
          </span>
          <Select
            value={filters.teamId == null ? ANY : String(filters.teamId)}
            onValueChange={(value) =>
              apply({
                ...filters,
                teamId: value === ANY ? null : Number(value),
              })
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>
                {translate("crm.analytics.filters.all_teams")}
              </SelectItem>
              {(teams ?? []).map((team) => (
                <SelectItem key={team.id} value={String(team.id)}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      ) : null}
    </div>
  );
};
