import { useCanAccess, useTranslate } from "ra-core";

import { BooleanField } from "@/components/admin/boolean-field";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { ReferenceField } from "@/components/admin/reference-field";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";

import { TopToolbar } from "../layout/TopToolbar";
import { formatMoneyExact } from "../misc/reporting";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Product } from "../types";
import { labelOf, PRODUCT_KIND_CHOICES } from "./catalogue";

const ProductListActions = () => {
  const { canAccess: canCreate } = useCanAccess({
    resource: "products",
    action: "create",
  });
  return (
    <TopToolbar>
      {canCreate ? (
        <CreateButton label="resources.products.action.new" />
      ) : null}
    </TopToolbar>
  );
};

/**
 * The catalogue quotes are priced from (quotes §2.2).
 *
 * Reps read it and managers maintain it (§7). The shadcn-admin-kit buttons do
 * not consult `canAccess`, so this list does: a row opens the editor only for
 * somebody allowed to save it. There is no delete, single or bulk -- every
 * product has append-only history, so the database refuses to remove one, and
 * a product that is no longer sold is deactivated.
 */
export const ProductList = () => {
  const translate = useTranslate();
  const { productCategories, productUnits } = useConfigurationContext();
  const { canAccess: canEdit } = useCanAccess({
    resource: "products",
    action: "edit",
  });

  const filters = [
    <SearchInput source="q" alwaysOn />,
    <SelectInput
      source="kind"
      label={false}
      alwaysOn
      emptyText="resources.products.filters.any_kind"
      choices={PRODUCT_KIND_CHOICES}
    />,
    <SelectInput
      source="category"
      label={false}
      alwaysOn
      emptyText="resources.products.filters.any_category"
      choices={productCategories}
      optionText="label"
      optionValue="value"
    />,
  ];

  return (
    <List
      filters={filters}
      actions={<ProductListActions />}
      sort={{ field: "name", order: "ASC" }}
    >
      <DataTable rowClick={canEdit ? "edit" : false} bulkActionButtons={false}>
        <DataTable.Col source="sku" />
        <DataTable.Col source="name" />
        <DataTable.Col<Product>
          source="kind"
          render={(product) =>
            translate(`resources.products.kinds.${product.kind}`)
          }
        />
        <DataTable.Col<Product>
          source="category"
          render={(product) => labelOf(productCategories, product.category)}
        />
        <DataTable.Col<Product>
          source="unit"
          render={(product) => labelOf(productUnits, product.unit)}
        />
        {/* Exact, never the dashboard's compact `$9.2M`: a price is read to
            the last unit (F4). */}
        <DataTable.Col<Product>
          source="list_price"
          headerClassName="text-right"
          cellClassName="text-right tabular-nums"
          render={(product) =>
            formatMoneyExact(product.list_price, product.currency)
          }
        />
        <DataTable.Col source="tax_rate_id">
          <ReferenceField
            source="tax_rate_id"
            reference="tax_rates"
            link={false}
          />
        </DataTable.Col>
        <DataTable.Col source="is_active">
          <BooleanField source="is_active" />
        </DataTable.Col>
      </DataTable>
    </List>
  );
};
