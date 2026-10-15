import { Film, FolderTree } from "lucide-react";
import { required, useNotify, useTranslate } from "ra-core";
import { Link } from "react-router";

import { Create } from "@/components/admin/create";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { Edit } from "@/components/admin/edit";
import { List } from "@/components/admin/list";
import { NumberInput } from "@/components/admin/number-input";
import { SelectInput } from "@/components/admin/select-input";
import { SimpleForm } from "@/components/admin/simple-form";
import { TextInput } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";

import { TopToolbar } from "../layout/TopToolbar";
import { FormSection } from "../misc/FormSection";
import { isUniqueViolation } from "../misc/useConflictNotifier";
import { HELP_ICON_CHOICES } from "./helpIcons";
import { validateSlug } from "./helpForm";

/** The manual's categories: the headings tutorials are filed under. */
const HelpCategoryListActions = () => {
  const translate = useTranslate();
  return (
    <TopToolbar>
      <Button asChild variant="outline">
        <Link to="/help_tutorials">
          <Film className="size-4" />
          {translate("resources.help_tutorials.name", { smart_count: 2 })}
        </Link>
      </Button>
      <CreateButton label="resources.help_categories.action.new" />
    </TopToolbar>
  );
};

export const HelpCategoryList = () => (
  <List
    actions={<HelpCategoryListActions />}
    sort={{ field: "rank", order: "ASC" }}
    perPage={50}
  >
    <DataTable rowClick="edit" bulkActionButtons={false}>
      <DataTable.Col source="rank" />
      <DataTable.Col source="title" />
      <DataTable.Col source="slug" />
      <DataTable.Col source="description" />
    </DataTable>
  </List>
);

const HelpCategoryInputs = () => {
  const translate = useTranslate();
  return (
    <FormSection
      icon={FolderTree}
      title={translate("resources.help_categories.forcedCaseName")}
      description={translate("crm.form_section.help_category")}
      className="w-full"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
        <TextInput
          source="title"
          validate={required()}
          className="sm:flex-1"
          helperText={false}
        />
        <TextInput
          source="slug"
          validate={[required(), validateSlug]}
          className="sm:flex-1"
          helperText={false}
        />
      </div>
      <TextInput source="description" multiline rows={2} helperText={false} />
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
        <SelectInput
          source="icon"
          choices={HELP_ICON_CHOICES}
          translateChoice={false}
          defaultValue="book-open"
          validate={required()}
          className="sm:w-56"
          helperText={false}
        />
        <NumberInput
          source="rank"
          defaultValue={0}
          className="sm:w-32"
          helperText={false}
        />
      </div>
    </FormSection>
  );
};

/**
 * A slug already taken is 23505; deleting a category that still holds
 * tutorials is 23503 -- they are moved or deleted first, never orphaned.
 */
const useHelpCategoryErrorNotifier = () => {
  const notify = useNotify();
  return (error: unknown) => {
    const err = error as { code?: string; body?: { code?: string } } | null;
    const key = isUniqueViolation(error)
      ? "resources.help_categories.errors.conflict"
      : (err?.body?.code ?? err?.code) === "23503"
        ? "resources.help_categories.errors.in_use"
        : error instanceof Error && error.message
          ? error.message
          : "ra.notification.http_error";
    notify(key, { type: "error" });
  };
};

export const HelpCategoryCreate = () => {
  const onError = useHelpCategoryErrorNotifier();
  return (
    <Create redirect="list" mutationOptions={{ onError }}>
      <SimpleForm>
        <HelpCategoryInputs />
      </SimpleForm>
    </Create>
  );
};

export const HelpCategoryEdit = () => {
  const onError = useHelpCategoryErrorNotifier();
  return (
    <Edit
      redirect="list"
      mutationMode="pessimistic"
      mutationOptions={{ onError }}
    >
      <SimpleForm>
        <HelpCategoryInputs />
      </SimpleForm>
    </Edit>
  );
};
