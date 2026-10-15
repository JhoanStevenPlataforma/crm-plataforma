import { BookOpenText, FolderTree } from "lucide-react";
import { useNotify, useTranslate } from "ra-core";
import { Link } from "react-router";

import { BooleanField } from "@/components/admin/boolean-field";
import { Create } from "@/components/admin/create";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { Edit } from "@/components/admin/edit";
import { List } from "@/components/admin/list";
import { ReferenceField } from "@/components/admin/reference-field";
import { SimpleForm } from "@/components/admin/simple-form";
import { Button } from "@/components/ui/button";

import { TopToolbar } from "../layout/TopToolbar";
import { isUniqueViolation } from "../misc/useConflictNotifier";
import type { HelpTutorial } from "../types";
import { formatDuration } from "./helpMedia";
import { cleanTutorial } from "./helpForm";
import { HelpTutorialInputs } from "./HelpTutorialInputs";

/**
 * The manual's admin screens (docs/proposals/help-center.md): the catalogue
 * of tutorials. Only admins reach them -- `canAccess` keeps everybody else
 * out and RLS refuses their writes.
 */
const HelpTutorialListActions = () => {
  const translate = useTranslate();
  return (
    <TopToolbar>
      <Button asChild variant="outline">
        <Link to="/help">
          <BookOpenText className="size-4" />
          {translate("crm.help.view_manual")}
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link to="/help_categories">
          <FolderTree className="size-4" />
          {translate("resources.help_categories.name", { smart_count: 2 })}
        </Link>
      </Button>
      <CreateButton label="resources.help_tutorials.action.new" />
    </TopToolbar>
  );
};

export const HelpTutorialList = () => (
  <List
    actions={<HelpTutorialListActions />}
    sort={{ field: "rank", order: "ASC" }}
    perPage={50}
  >
    <DataTable rowClick="edit" bulkActionButtons={false}>
      <DataTable.Col source="rank" />
      <DataTable.Col source="title" />
      <DataTable.Col source="category_id">
        <ReferenceField
          source="category_id"
          reference="help_categories"
          link={false}
        />
      </DataTable.Col>
      <DataTable.Col<HelpTutorial>
        source="duration_seconds"
        cellClassName="tabular-nums"
        render={(tutorial) =>
          tutorial.duration_seconds != null
            ? formatDuration(tutorial.duration_seconds)
            : ""
        }
      />
      <DataTable.Col source="is_published">
        <BooleanField source="is_published" />
      </DataTable.Col>
      <DataTable.Col source="updated_at">
        <DateField source="updated_at" />
      </DataTable.Col>
    </DataTable>
  </List>
);

/**
 * Names the two refusals an admin can actually cause: a slug already taken
 * (23505) and a tutorial published with no recording (23514, the
 * `help_tutorials_published_has_video` check).
 */
const useHelpTutorialErrorNotifier = () => {
  const notify = useNotify();
  return (error: unknown) => {
    const err = error as { code?: string; body?: { code?: string } } | null;
    const key = isUniqueViolation(error)
      ? "resources.help_tutorials.errors.conflict"
      : (err?.body?.code ?? err?.code) === "23514"
        ? "resources.help_tutorials.errors.publish_without_video"
        : error instanceof Error && error.message
          ? error.message
          : "ra.notification.http_error";
    notify(key, { type: "error" });
  };
};

export const HelpTutorialCreate = () => {
  const onError = useHelpTutorialErrorNotifier();
  return (
    <Create
      redirect="list"
      transform={cleanTutorial}
      mutationOptions={{ onError }}
    >
      <SimpleForm>
        <HelpTutorialInputs />
      </SimpleForm>
    </Create>
  );
};

/** Pessimistic, so a refusal is reported in the form instead of rolled back. */
export const HelpTutorialEdit = () => {
  const onError = useHelpTutorialErrorNotifier();
  return (
    <Edit
      redirect="list"
      mutationMode="pessimistic"
      transform={cleanTutorial}
      mutationOptions={{ onError }}
    >
      <SimpleForm>
        <HelpTutorialInputs />
      </SimpleForm>
    </Edit>
  );
};
