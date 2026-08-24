import { X } from "lucide-react";
import {
  useCreate,
  useDelete,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
  useTranslate,
  type Identifier,
} from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Sale, Team, TeamMember } from "../types";

const salesName = (sale: Sale) => `${sale.first_name} ${sale.last_name}`;

/**
 * Who is in the team (proposal §3.2, deliverable 2.4).
 *
 * Membership is a plain join row, deliberately unlike `task_assignments`:
 * belonging to a team is current state, not task history, so removing somebody
 * deletes the row. What they did while they were in it stays in `task_events`,
 * which is where the audit trail actually lives.
 */
export const TeamMembers = () => {
  const team = useRecordContext<Team>();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [picked, setPicked] = useState<string>("");

  const { data: members, error: membersError } = useGetList<TeamMember>(
    "team_members",
    {
      filter: { team_id: team?.id },
      sort: { field: "id", order: "ASC" },
      pagination: { page: 1, perPage: 200 },
    },
    { enabled: team?.id != null },
  );

  const { data: sales } = useGetList<Sale>("sales", {
    filter: { "disabled@neq": true },
    sort: { field: "first_name", order: "ASC" },
    pagination: { page: 1, perPage: 200 },
  });

  /**
   * A failed load is NOT an empty team.
   *
   * Treating it as one is how a read error turns into a write error: with no
   * members known, every existing member is offered as a candidate, and adding
   * one violates `unique (team_id, sales_id)` — which surfaces as "the
   * membership could not be saved", pointing at the write instead of the read
   * that actually broke.
   */
  const isRosterUnknown = membersError != null;

  const [create, { isPending: isCreating }] = useCreate();
  const [remove, { isPending: isRemoving }] = useDelete();
  const isMutating = isCreating || isRemoving;

  /**
   * `23505` is the unique violation on `(team_id, sales_id)` — the person is
   * already in the team. Reporting that as a generic save failure sends whoever
   * hits it looking for a broken write, when the write did exactly its job.
   */
  const onError = (error: unknown) => {
    const err = error as { code?: string; body?: { code?: string } };
    const code = err?.body?.code ?? err?.code;
    notify(
      code === "23505"
        ? "resources.teams.members.duplicate"
        : "resources.teams.members.error",
      { type: "error" },
    );
  };

  if (!team) return null;

  const memberIds = new Set((members ?? []).map((m) => String(m.sales_id)));
  const candidates = (sales ?? []).filter(
    (sale) => !memberIds.has(String(sale.id)),
  );
  const nameOf = (id: Identifier) => {
    const sale = sales?.find((s) => String(s.id) === String(id));
    return sale ? salesName(sale) : `#${id}`;
  };

  const addMember = () => {
    if (!picked || isMutating) return;
    create(
      "team_members",
      { data: { team_id: team.id, sales_id: Number(picked) } },
      { onSuccess: () => refresh(), onError },
    );
    setPicked("");
  };

  const removeMember = (member: TeamMember) =>
    remove(
      "team_members",
      { id: member.id, previousData: member },
      { onSuccess: () => refresh(), onError },
    );

  return (
    <div className="flex flex-col gap-3 w-full">
      <h3 className="text-sm font-medium">
        {translate("resources.teams.members.title")}
      </h3>

      {isRosterUnknown ? (
        <p className="text-sm text-destructive">
          {translate("resources.teams.members.load_error")}
        </p>
      ) : (members ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("resources.teams.members.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {(members ?? []).map((member) => (
            <li key={member.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{nameOf(member.sales_id)}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label={translate("resources.teams.members.remove", {
                  name: nameOf(member.sales_id),
                })}
                onClick={() => removeMember(member)}
                disabled={isMutating}
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Adding is disabled while the roster is unknown: every candidate shown
          would be a guess, and picking one already in the team fails on the
          unique constraint with a message that blames the write. */}
      <div className="flex gap-2">
        <Select
          value={picked}
          onValueChange={setPicked}
          disabled={isRosterUnknown}
        >
          <SelectTrigger
            className="flex-1"
            aria-label={translate("resources.teams.members.add")}
          >
            <SelectValue
              placeholder={translate("resources.teams.members.add")}
            />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((sale) => (
              <SelectItem key={sale.id} value={String(sale.id)}>
                {salesName(sale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          onClick={addMember}
          disabled={!picked || isMutating || isRosterUnknown}
        >
          {translate("ra.action.add")}
        </Button>
      </div>
    </div>
  );
};
