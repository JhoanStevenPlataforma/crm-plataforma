import { minValue, required } from "ra-core";

import { BooleanInput } from "@/components/admin/boolean-input";
import { NumberInput } from "@/components/admin/number-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

import { useConfigurationContext } from "../root/ConfigurationContext";
import {
  PRODUCT_KIND_CHOICES,
  toCurrencyCode,
  validateCurrencyCode,
} from "./catalogue";

/**
 * A product as the catalogue holds it (quotes §2.2, §13.2).
 *
 * `currency` has no database default on purpose (F3): a Colombian catalogue
 * silently inheriting "USD" is the bug that rule prevents. The form suggests
 * the currency an administrator configured and still requires a valid code.
 *
 * Labels resolve from `resources.products.fields.*` by source name.
 */
export const ProductInputs = () => {
  const { currency, productCategories, productUnits } =
    useConfigurationContext();

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
        <TextInput
          source="sku"
          validate={required()}
          className="sm:w-48"
          helperText={false}
        />
        <TextInput
          source="name"
          validate={required()}
          className="sm:flex-1"
          helperText={false}
        />
      </div>
      <TextInput source="description" multiline helperText={false} />

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
        <SelectInput
          source="kind"
          choices={PRODUCT_KIND_CHOICES}
          defaultValue="product"
          validate={required()}
          className="sm:flex-1"
          helperText={false}
        />
        <SelectInput
          source="category"
          choices={productCategories}
          optionText="label"
          optionValue="value"
          className="sm:flex-1"
          helperText={false}
        />
        <SelectInput
          source="unit"
          choices={productUnits}
          optionText="label"
          optionValue="value"
          defaultValue="unit"
          validate={required()}
          className="sm:flex-1"
          helperText={false}
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
        <NumberInput
          source="list_price"
          defaultValue={0}
          min={0}
          validate={[required(), minValue(0)]}
          className="sm:flex-1"
          helperText={false}
        />
        <TextInput
          source="currency"
          defaultValue={currency}
          parse={toCurrencyCode}
          validate={[required(), validateCurrencyCode]}
          className="sm:w-28"
          helperText={false}
        />
        <ReferenceInput
          source="tax_rate_id"
          reference="tax_rates"
          sort={{ field: "rank", order: "ASC" }}
        >
          <SelectInput
            optionText="label"
            label="resources.products.fields.tax_rate_id"
            className="sm:flex-1"
            helperText={false}
          />
        </ReferenceInput>
      </div>

      <TextInput
        source="internal_notes"
        multiline
        helperText="resources.products.helpers.internal_notes"
      />
      <BooleanInput
        source="is_active"
        defaultValue={true}
        helperText="resources.products.helpers.is_active"
      />
    </div>
  );
};
