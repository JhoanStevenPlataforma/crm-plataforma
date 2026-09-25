import { useTranslate } from "ra-core";

import { BulkActionsToolbar } from "@/components/admin/bulk-actions-toolbar";
import { BulkDeleteButton } from "@/components/admin/bulk-delete-button";
import { BulkExportButton } from "@/components/admin/bulk-export-button";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { ListPagination } from "@/components/admin/list-pagination";
import { ReferenceField } from "@/components/admin/reference-field";
import { SearchInput } from "@/components/admin/search-input";
import { SelectAllButton } from "@/components/admin/select-all-button";
import { SelectInput } from "@/components/admin/select-input";

import { TopToolbar } from "../layout/TopToolbar";
import { BulkAssignOwnerButton } from "../misc/BulkAssignOwnerButton";
import { SalesFilterInput } from "../misc/SalesFilterInput";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Lead } from "../types";
import { LeadCompanyField } from "./LeadCompanyField";
import { LeadRowActions } from "./LeadRowActions";
import { LeadScoreField } from "./LeadScoreField";
import { LeadStats } from "./LeadStats";
import { LeadStatusBadge } from "./LeadStatusBadge";

const LeadListActions = () => (
  <TopToolbar>
    <ExportButton />
    <CreateButton label="resources.leads.action.new" />
  </TopToolbar>
);

const LeadBulkActionButtons = () => (
  <>
    <SelectAllButton />
    <BulkAssignOwnerButton />
    <BulkExportButton />
    <BulkDeleteButton />
  </>
);

/**
 * The lead desk: how the funnel is filling, then the rows to work.
 *
 * The three filters are the three questions a rep actually asks of this list —
 * whose is it, where is it in the funnel, where did it come from — and all
 * three are `alwaysOn`, because a filter behind a menu is a filter nobody
 * discovers. Status and source read their options from the application
 * configuration, so an installation that renames a stage renames it here too.
 */
export const LeadList = () => {
  const translate = useTranslate();
  const { leadStatuses, leadSources } = useConfigurationContext();

  const leadFilters = [
    <SearchInput source="q" alwaysOn />,
    // Renders nothing for a sales rep, whose list is already scoped by RLS.
    <SalesFilterInput source="sales_id" alwaysOn />,
    <SelectInput
      source="status"
      label={false}
      alwaysOn
      emptyText="resources.leads.filters.any_status"
      choices={leadStatuses}
      optionText="label"
      optionValue="value"
    />,
    <SelectInput
      source="source"
      label={false}
      alwaysOn
      emptyText="resources.leads.filters.any_source"
      choices={leadSources}
      optionText="label"
      optionValue="value"
    />,
  ];

  return (
    // The KPI strip sits between the heading and the list: the header keeps
    // the title, the count and the actions on one row above it.
    <List
      summary={<LeadStats />}
      perPage={25}
      sort={{ field: "created_at", order: "DESC" }}
      filters={leadFilters}
      actions={<LeadListActions />}
      pagination={<ListPagination rowsPerPageOptions={[10, 25, 50, 100]} />}
    >
      <DataTable>
        <DataTable.Col
          source="last_name"
          label="resources.leads.fields.name"
          render={(record: Lead) =>
            `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim() ||
            translate("resources.leads.unnamed")
          }
        />
        <DataTable.Col
          source="company_name"
          label="resources.leads.fields.company"
        >
          <LeadCompanyField />
        </DataTable.Col>
        <DataTable.Col source="email" />
        <DataTable.Col source="status">
          <LeadStatusBadge choices={leadStatuses} />
        </DataTable.Col>
        {/* Sortable: ranking the desk by score is the whole reason a score
              column earns its width. */}
        <DataTable.Col source="score">
          <LeadScoreField />
        </DataTable.Col>
        <DataTable.Col
          source="source"
          render={(record: Lead) =>
            leadSources.find((choice) => choice.value === record.source)
              ?.label ?? record.source
          }
        />
        <DataTable.Col source="sales_id">
          <ReferenceField source="sales_id" reference="sales" />
        </DataTable.Col>
        <DataTable.Col source="created_at">
          <DateField source="created_at" />
        </DataTable.Col>
        {/* No `source`, so the header stays blank and the column does not
              offer a sort on something that is not a value. */}
        <DataTable.Col
          label="resources.leads.fields.actions"
          disableSort
          headerClassName="text-right"
          cellClassName="text-right"
        >
          <LeadRowActions />
        </DataTable.Col>
      </DataTable>

      <BulkActionsToolbar>
        <LeadBulkActionButtons />
      </BulkActionsToolbar>
    </List>
  );
};
