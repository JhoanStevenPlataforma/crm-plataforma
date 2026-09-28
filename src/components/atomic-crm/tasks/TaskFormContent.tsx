import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { required, useTranslate } from "ra-core";
import { useWatch } from "react-hook-form";
import { TriangleAlert } from "lucide-react";
import { DateTimeInput } from "@/components/admin";

import { contactOptionText } from "../misc/ContactOption";
import { useConfigurationContext } from "../root/ConfigurationContext";

/**
 * The task form (proposal §3.3, §16).
 *
 * Two rules from the proposal are load-bearing here:
 *
 *  - Title and description are separate fields. They used to be one `text`
 *    column, which made lists unreadable as soon as somebody wrote a paragraph.
 *  - Everything the enterprise model adds is optional with a sane default, so
 *    creating a follow-up stays a two-field job. Status defaults to `pending`
 *    in the database and is never asked for at creation time.
 *
 * `type` keeps writing the legacy string column on purpose: it is driven by the
 * `taskTypes` prop of `<CRM>`, a documented configuration point, and a database
 * shim resolves it to `task_type_id`.
 */
export const TaskFormContent = ({
  selectContact,
}: {
  selectContact?: boolean;
}) => {
  const { taskTypes } = useConfigurationContext();
  return (
    <div className="flex flex-col gap-4">
      <TextInput
        autoFocus
        source="title"
        validate={required()}
        className="m-0"
        helperText={false}
      />
      <TextInput
        source="description"
        multiline
        className="m-0"
        helperText={false}
      />
      {selectContact && (
        <ReferenceInput source="contact_id" reference="contacts_summary">
          <AutocompleteInput
            label="resources.tasks.fields.contact_id"
            optionText={contactOptionText}
            helperText={false}
            validate={required()}
            modal
          />
        </ReferenceInput>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DateTimeInput
          source="due_date"
          helperText={false}
          validate={required()}
        />
        <SelectInput
          source="type"
          validate={required()}
          choices={taskTypes}
          optionText="label"
          optionValue="value"
          defaultValue="none"
          helperText={false}
        />
      </div>
      <PastDueHint />

      <ReferenceInput
        source="priority_id"
        reference="task_priorities"
        sort={{ field: "rank", order: "ASC" }}
      >
        <SelectInput
          label="resources.tasks.fields.priority"
          optionText="label"
          helperText={false}
        />
      </ReferenceInput>
    </div>
  );
};

/**
 * A warning, not a refusal: logging a call made yesterday as a task is
 * legitimate. It only says what will happen, so nobody is surprised to find
 * the new task already in the overdue bucket.
 */
const PastDueHint = () => {
  const translate = useTranslate();
  const dueDate = useWatch({ name: "due_date" });
  const due = dueDate ? new Date(dueDate) : null;
  if (!due || Number.isNaN(due.getTime()) || due.getTime() >= Date.now()) {
    return null;
  }
  return (
    <p
      role="status"
      className="-mt-2 flex items-center gap-1.5 text-sm text-warning"
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden />
      {translate("resources.tasks.past_due_warning")}
    </p>
  );
};
