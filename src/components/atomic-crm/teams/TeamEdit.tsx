import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";

import { TeamBudgetHistory } from "./TeamBudgetHistory";
import { TeamInputs } from "./TeamInputs";
import { TeamMemberBudgets } from "./TeamMemberBudgets";
import { TeamMembers } from "./TeamMembers";

/**
 * Members are edited outside the form on purpose: adding somebody to a team
 * takes effect immediately (it changes what they can see, through the task RLS
 * rule), so hiding it behind an unsaved form would misrepresent when access
 * actually changes.
 *
 * The per-member split sits outside it for a related reason: it belongs to a
 * budget period, not to the team record, so sharing the form's Save button
 * would make re-saving the form with a new period look as though the old split
 * carried forward. It comes after the members panel because it can only divide
 * the target between people who are already in the team.
 */
export function TeamEdit() {
  return (
    <Edit redirect={false}>
      <SimpleForm>
        <TeamInputs />
      </SimpleForm>
      <div className="p-4 pt-0 flex flex-col gap-6">
        <TeamMembers />
        <TeamMemberBudgets />
        <TeamBudgetHistory />
      </div>
    </Edit>
  );
}
