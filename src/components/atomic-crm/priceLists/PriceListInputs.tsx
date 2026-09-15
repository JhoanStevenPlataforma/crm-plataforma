import { required } from "ra-core";

import { BooleanInput } from "@/components/admin/boolean-input";
import { DateInput } from "@/components/admin/date-input";
import { TextInput } from "@/components/admin/text-input";

import {
  toCurrencyCode,
  validateCurrencyCode,
  validatePeriod,
} from "../products/catalogue";
import { useConfigurationContext } from "../root/ConfigurationContext";

/**
 * A price list's header (quotes §2.2). Its prices are edited under the form, in
 * `PriceListItems`.
 *
 * Labels resolve from `resources.price_lists.fields.*` by source name.
 */
export const PriceListInputs = () => {
  const { currency } = useConfigurationContext();

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
        <TextInput
          source="code"
          validate={required()}
          className="sm:w-40"
          helperText={false}
        />
        <TextInput
          source="name"
          validate={required()}
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
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
        <BooleanInput
          source="is_default"
          defaultValue={false}
          helperText={false}
        />
        <BooleanInput
          source="is_active"
          defaultValue={true}
          helperText={false}
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
        <DateInput
          source="valid_from"
          className="sm:flex-1"
          helperText="resources.price_lists.helpers.validity"
        />
        <DateInput
          source="valid_to"
          validate={validatePeriod}
          className="sm:flex-1"
          helperText={false}
        />
      </div>

      <TextInput source="notes" multiline helperText={false} />
    </div>
  );
};
