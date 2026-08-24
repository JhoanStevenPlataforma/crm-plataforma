import { X } from "lucide-react";
import {
  useCreate,
  useGetList,
  useGetOne,
  useNotify,
  useRefresh,
  useTranslate,
  useUpdate,
  type Identifier,
} from "ra-core";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Sale, Task, TaskAssignment, TaskRole, Team } from "../types";

const salesName = (sale: Sale) => `${sale.first_name} ${sale.last_name}`;

/** The roles this panel manages. `owner` is edited on the Detail tab. */
const EDITABLE_ROLES: TaskRole[] = ["collaborator", "watcher", "team"];

/**
 * Who is on this task, besides its owner (proposal §7.1).
 *
 * This is the delegation fix made usable. A collaborator can work the task, a
 * watcher only follows it, and a team puts every one of its members on it —
 * and in all three cases the access comes from the assignment row itself, not
 * from who happens to own the linked contact (W6/B2).
 *
 * Nothing here deletes: removing somebody closes their row with
 * `unassigned_at`, so "who was on this task in June" stays answerable. The
 * database emits the matching event either way.
 */
export const TaskParticipants = ({ taskId }: { taskId: Identifier }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [role, setRole] = useState<TaskRole>("collaborator");
  const [picked, setPicked] = useState<string>("");

  const { data: task } = useGetOne<Task>("tasks", { id: taskId });

  const { data: assignments } = useGetList<TaskAssignment>("task_assignments", {
    filter: { task_id: taskId, "unassigned_at@is": null },
    sort: { field: "id", order: "ASC" },
    pagination: { page: 1, perPage: 100 },
  });

  const { data: sales } = useGetList<Sale>("sales", {
    filter: { "disabled@neq": true },
    sort: { field: "first_name", order: "ASC" },
    pagination: { page: 1, perPage: 200 },
  });

  const { data: teams } = useGetList<Team>("teams", {
    sort: { field: "name", order: "ASC" },
    pagination: { page: 1, perPage: 200 },
  });

  const [create, { isPending: isCreating }] = useCreate();
  const [update, { isPending: isUpdating }] = useUpdate();
  const isMutating = isCreating || isUpdating;

  const onError = () =>
    notify("resources.tasks.participants.error", { type: "error" });

  const active = assignments ?? [];
  const isTeamRole = role === "team";

  const nameOfSale = (id?: Identifier | null) => {
    if (id == null) return "";
    const sale = sales?.find((s) => String(s.id) === String(id));
    return sale ? salesName(sale) : `#${id}`;
  };
  const nameOfTeam = (id?: Identifier | null) => {
    if (id == null) return "";
    return teams?.find((t) => String(t.id) === String(id))?.name ?? `#${id}`;
  };
  const labelOf = (assignment: TaskAssignment) =>
    assignment.team_id != null
      ? nameOfTeam(assignment.team_id)
      : nameOfSale(assignment.sales_id);

  // Somebody already on the task in this role is not offered again; the
  // database's own guard is the unique index, this only keeps the list honest.
  const takenIds = new Set(
    active
      .filter((assignment) => assignment.role === role)
      .map((assignment) =>
        String(assignment.team_id ?? assignment.sales_id ?? ""),
      ),
  );
  const candidates = isTeamRole
    ? (teams ?? []).filter((team) => !takenIds.has(String(team.id)))
    : (sales ?? []).filter(
        (sale) =>
          !takenIds.has(String(sale.id)) &&
          String(sale.id) !== String(task?.owner_sales_id ?? ""),
      );

  const addParticipant = () => {
    if (!picked || isMutating) return;
    create(
      "task_assignments",
      {
        data: {
          task_id: taskId,
          role,
          ...(isTeamRole
            ? { team_id: Number(picked) }
            : { sales_id: Number(picked) }),
        },
      },
      { onSuccess: () => refresh(), onError },
    );
    setPicked("");
  };

  const removeParticipant = (assignment: TaskAssignment) =>
    update(
      "task_assignments",
      {
        id: assignment.id,
        data: { unassigned_at: new Date().toISOString() },
        previousData: assignment,
      },
      { onSuccess: () => refresh(), onError },
    );

  const renderRole = (roleKey: TaskRole) => {
    const rows = active.filter((assignment) => assignment.role === roleKey);
    return (
      <section key={roleKey} className="flex flex-col gap-1">
        <h4 className="text-xs font-medium text-muted-foreground">
          {translate(`resources.tasks.participants.roles.${roleKey}`)}
          {rows.length > 0 && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              {rows.length}
            </Badge>
          )}
        </h4>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate("resources.tasks.participants.none")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rows.map((assignment) => (
              <li
                key={assignment.id}
                className="flex items-center gap-2 text-sm"
              >
                <span className="flex-1">{labelOf(assignment)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  aria-label={translate("resources.tasks.participants.remove", {
                    name: labelOf(assignment),
                  })}
                  onClick={() => removeParticipant(assignment)}
                  disabled={isMutating}
                >
                  <X className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1">
        <h4 className="text-xs font-medium text-muted-foreground">
          {translate("resources.tasks.participants.roles.owner")}
        </h4>
        <p className="text-sm">
          {task?.owner_name ||
            nameOfSale(task?.owner_sales_id) ||
            translate("resources.tasks.participants.none")}
        </p>
      </section>

      {EDITABLE_ROLES.map(renderRole)}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          value={role}
          onValueChange={(value) => {
            setRole(value as TaskRole);
            setPicked("");
          }}
        >
          <SelectTrigger
            className="sm:w-40"
            aria-label={translate("resources.tasks.participants.role")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EDITABLE_ROLES.map((roleKey) => (
              <SelectItem key={roleKey} value={roleKey}>
                {translate(`resources.tasks.participants.roles.${roleKey}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger
            className="flex-1"
            aria-label={translate("resources.tasks.participants.add")}
          >
            <SelectValue
              placeholder={translate("resources.tasks.participants.add")}
            />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={String(candidate.id)}>
                {isTeamRole
                  ? (candidate as Team).name
                  : salesName(candidate as Sale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="sm"
          onClick={addParticipant}
          disabled={!picked || isMutating}
        >
          {translate("ra.action.add")}
        </Button>
      </div>
    </div>
  );
};
