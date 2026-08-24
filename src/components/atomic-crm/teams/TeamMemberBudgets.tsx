import {
  useDataProvider,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
  useTranslate,
} from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Team, TeamMember, TeamMemberBudget } from "../types";
import { allocationOf, formatMoney } from "./teamBudget";
import { memberNameOf } from "./teamMemberName";

/** The edits in progress, keyed by `team_members.id`. `""` means "no quota". */
type Draft = Record<string, string>;

/**
 * Splitting the team target between its members.
 *
 * Outside the team form on purpose, like the member list above it: the split
 * belongs to a budget period, not to the team record, so saving it through the
 * form would tie two different lifecycles to one Save button — and re-saving
 * the form with a new period would appear to carry the old split forward.
 *
 * All the rows are edited together and written on one Save. Writing each input
 * on blur would make an over-allocation appear and disappear as the manager
 * moves money between two people, and every intermediate state would hit the
 * server.
 *
 * The sum is not capped: the database accepts a split that overshoots and this
 * panel says so, in figures. Refusing the write would leave the manager unable
 * to raise one quota before lowering another.
 */
export const TeamMemberBudgets = () => {
  const team = useRecordContext<Team>();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const dataProvider = useDataProvider();
  const { currency } = useConfigurationContext();
  const [draft, setDraft] = useState<Draft>({});
  const [isSaving, setIsSaving] = useState(false);

  // Same filter, sort and page size as `TeamMembers`, so the two panels share
  // one request instead of asking for the same roster twice.
  const { data: members } = useGetList<TeamMember>(
    "team_members",
    {
      filter: { team_id: team?.id },
      sort: { field: "id", order: "ASC" },
      pagination: { page: 1, perPage: 200 },
    },
    { enabled: team?.id != null },
  );

  const { data: allocations } = useGetList<TeamMemberBudget>(
    "team_member_budgets",
    {
      filter: { budget_id: team?.budget_id },
      sort: { field: "id", order: "ASC" },
      pagination: { page: 1, perPage: 200 },
    },
    { enabled: team?.budget_id != null },
  );

  if (!team) return null;

  // No period, nothing to divide. Rendering the inputs anyway would collect
  // numbers with nowhere to store them — allocations hang off the budget row.
  if (team.budget_id == null) {
    return (
      <div className="flex flex-col gap-3 w-full">
        <h3 className="text-sm font-medium">
          {translate("resources.teams.allocation.title")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {translate("resources.teams.allocation.no_budget")}
        </p>
      </div>
    );
  }

  const savedOf = (member: TeamMember) =>
    (allocations ?? []).find(
      (allocation) => String(allocation.team_member_id) === String(member.id),
    );

  const valueOf = (member: TeamMember) => {
    const key = String(member.id);
    if (key in draft) return draft[key];
    const saved = savedOf(member);
    return saved == null ? "" : String(saved.amount);
  };

  const allocated = (members ?? []).reduce((total, member) => {
    const value = valueOf(member);
    const amount = value === "" ? 0 : Number(value);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  const allocation = allocationOf(team.budget_amount, allocated);
  const isDirty = Object.keys(draft).length > 0;

  /**
   * One write per changed row: a create for a new quota, an update for a
   * changed one, a delete for a cleared one. Deleting rather than storing zero
   * keeps "no quota set" distinct from "a quota of nothing", which is the same
   * distinction the roster renders as a dash instead of 0%.
   */
  const save = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    try {
      for (const member of members ?? []) {
        const key = String(member.id);
        if (!(key in draft)) continue;

        const saved = savedOf(member);
        const raw = draft[key].trim();
        const amount = raw === "" ? null : Number(raw);

        if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
          throw new Error("invalid");
        }

        if (amount == null) {
          if (saved) {
            await dataProvider.delete("team_member_budgets", {
              id: saved.id,
              previousData: saved,
            });
          }
          continue;
        }

        if (!saved) {
          await dataProvider.create("team_member_budgets", {
            data: {
              team_id: team.id,
              budget_id: team.budget_id,
              team_member_id: member.id,
              amount,
            },
          });
          continue;
        }

        if (saved.amount !== amount) {
          await dataProvider.update("team_member_budgets", {
            id: saved.id,
            data: { amount },
            previousData: saved,
          });
        }
      }

      setDraft({});
      notify("resources.teams.allocation.saved", { type: "info" });
      refresh();
    } catch {
      notify("resources.teams.allocation.error", { type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <h3 className="text-sm font-medium">
        {translate("resources.teams.allocation.title")}
      </h3>

      {(members ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("resources.teams.members.empty")}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {(members ?? []).map((member) => (
              <li key={member.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{memberNameOf(member)}</span>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  className="w-40 text-right tabular-nums"
                  aria-label={translate("resources.teams.allocation.quota_of", {
                    name: memberNameOf(member),
                  })}
                  value={valueOf(member)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [String(member.id)]: event.target.value,
                    }))
                  }
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1">
            <Progress
              value={Math.min(100, (allocation.coverage ?? 0) * 100)}
              className="h-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {translate("resources.teams.allocation.allocated", {
                  allocated: formatMoney(allocation.allocated, currency),
                  budget: formatMoney(team.budget_amount, currency),
                })}
              </span>
              <span
                className={
                  allocation.isOverAllocated ? "text-destructive" : undefined
                }
              >
                {allocation.isOverAllocated
                  ? translate("resources.teams.allocation.over", {
                      amount: formatMoney(
                        Math.abs(allocation.remaining ?? 0),
                        currency,
                      ),
                    })
                  : translate("resources.teams.allocation.remaining", {
                      amount: formatMoney(allocation.remaining, currency),
                    })}
              </span>
            </div>
          </div>

          <div>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={!isDirty || isSaving}
            >
              {translate("resources.teams.allocation.save")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
