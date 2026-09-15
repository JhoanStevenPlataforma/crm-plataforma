import { useCanAccess } from "ra-core";

import { BooleanField } from "@/components/admin/boolean-field";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";

import { TopToolbar } from "../layout/TopToolbar";
import type { TaxRate } from "../types";

const TaxRateListActions = () => {
  const { canAccess: canCreate } = useCanAccess({
    resource: "tax_rates",
    action: "create",
  });
  return (
    <TopToolbar>
      {canCreate ? (
        <CreateButton label="resources.tax_rates.action.new" />
      ) : null}
    </TopToolbar>
  );
};

/**
 * Tax rates (quotes §2.1).
 *
 * A quote line freezes the rate it was taxed at, so editing a rate changes what
 * future lines are taxed at and nothing already quoted. No delete: a rate a
 * product or a quote line references cannot be deleted, and one that no longer
 * applies is deactivated.
 */
export const TaxRateList = () => {
  const { canAccess: canEdit } = useCanAccess({
    resource: "tax_rates",
    action: "edit",
  });

  return (
    <List
      actions={<TaxRateListActions />}
      sort={{ field: "rank", order: "ASC" }}
      perPage={50}
    >
      <DataTable rowClick={canEdit ? "edit" : false} bulkActionButtons={false}>
        <DataTable.Col source="code" />
        <DataTable.Col source="label" />
        <DataTable.Col<TaxRate>
          source="rate"
          headerClassName="text-right"
          cellClassName="text-right tabular-nums"
          render={(taxRate) => `${Number(taxRate.rate)}%`}
        />
        <DataTable.Col source="is_default">
          <BooleanField source="is_default" />
        </DataTable.Col>
        <DataTable.Col source="active">
          <BooleanField source="active" />
        </DataTable.Col>
        <DataTable.Col source="rank" />
      </DataTable>
    </List>
  );
};
