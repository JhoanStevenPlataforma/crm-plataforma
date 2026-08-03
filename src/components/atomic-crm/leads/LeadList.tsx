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

import { TopToolbar } from "../layout/TopToolbar";
import { BulkAssignOwnerButton } from "../misc/BulkAssignOwnerButton";
import { SalesFilterInput } from "../misc/SalesFilterInput";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Lead } from "../types";
import { LeadCompanyField } from "./LeadCompanyField";
import { LeadStatusBadge } from "./LeadStatusBadge";

const LeadListActions = () => (
  <TopToolbar>
    <ExportButton />
    <CreateButton />
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

export const LeadList = () => {
  const translate = useTranslate();
  const { leadStatuses, leadSources } = useConfigurationContext();

  const leadFilters = [
    <SearchInput source="q" alwaysOn />,
    // Renders nothing for a sales rep, whose list is already scoped by RLS.
    <SalesFilterInput source="sales_id" alwaysOn />,
  ];

  return (
    <List
      title={false}
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
      </DataTable>

      <BulkActionsToolbar>
        <LeadBulkActionButtons />
      </BulkActionsToolbar>
    </List>
  );
};
