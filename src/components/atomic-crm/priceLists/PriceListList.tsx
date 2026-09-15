import { useCanAccess } from "ra-core";

import { BooleanField } from "@/components/admin/boolean-field";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";

import { TopToolbar } from "../layout/TopToolbar";

const PriceListActions = () => {
  const { canAccess: canCreate } = useCanAccess({
    resource: "price_lists",
    action: "create",
  });
  return (
    <TopToolbar>
      {canCreate ? (
        <CreateButton label="resources.price_lists.action.new" />
      ) : null}
    </TopToolbar>
  );
};

const filters = [<SearchInput source="q" alwaysOn />];

/**
 * Price lists (quotes §2.2), with the access shape of products: every role
 * reads them, managers maintain them, and only somebody allowed to save opens a
 * row.
 *
 * No delete. A list quotes point at cannot be deleted -- the foreign key
 * refuses it -- and one that is no longer used is deactivated, which keeps its
 * prices on record.
 */
export const PriceListList = () => {
  const { canAccess: canEdit } = useCanAccess({
    resource: "price_lists",
    action: "edit",
  });

  return (
    <List
      filters={filters}
      actions={<PriceListActions />}
      sort={{ field: "name", order: "ASC" }}
    >
      <DataTable rowClick={canEdit ? "edit" : false} bulkActionButtons={false}>
        <DataTable.Col source="code" />
        <DataTable.Col source="name" />
        <DataTable.Col source="currency" />
        <DataTable.Col source="is_default">
          <BooleanField source="is_default" />
        </DataTable.Col>
        <DataTable.Col source="is_active">
          <BooleanField source="is_active" />
        </DataTable.Col>
        <DataTable.Col source="valid_from">
          <DateField source="valid_from" />
        </DataTable.Col>
        <DataTable.Col source="valid_to">
          <DateField source="valid_to" />
        </DataTable.Col>
      </DataTable>
    </List>
  );
};
