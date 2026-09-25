import {
  maxValue,
  minValue,
  required,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { Percent, Receipt } from "lucide-react";

import { BooleanInput } from "@/components/admin/boolean-input";
import { NumberInput } from "@/components/admin/number-input";
import { TextInput } from "@/components/admin/text-input";

import { FormSection } from "../misc/FormSection";
import type { TaxRate } from "../types";

/**
 * A tax rate (quotes §2.1).
 *
 * The seeded rows (`is_system`) keep their `code`: `exento` and `excluido` are
 * both 0% and legally distinct, and the code is what tells them apart. Their
 * label and rate stay editable, because a rate like IVA changes by law. This is
 * the interface half of §13.6 #5 -- the database itself does not stop a
 * manager renaming a seeded code through the API.
 *
 * Labels resolve from `resources.tax_rates.fields.*` by source name.
 */
export const TaxRateInputs = () => {
  const record = useRecordContext<TaxRate>();
  const translate = useTranslate();
  const isSystem = record?.is_system === true;

  return (
    <div className="flex flex-col gap-10 w-full">
      <FormSection
        icon={Receipt}
        title={translate("resources.tax_rates.field_categories.tax")}
        description={translate("crm.form_section.tax_identity")}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
          <TextInput
            source="code"
            validate={required()}
            disabled={isSystem}
            className="sm:w-40"
            helperText={
              isSystem ? "resources.tax_rates.helpers.system_code" : false
            }
          />
          <TextInput
            source="label"
            validate={required()}
            className="sm:flex-1"
            helperText={false}
          />
        </div>
      </FormSection>

      <FormSection
        icon={Percent}
        title={translate("resources.tax_rates.field_categories.rate")}
        description={translate("crm.form_section.tax_rate")}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
          <NumberInput
            source="rate"
            min={0}
            max={100}
            validate={[required(), minValue(0), maxValue(100)]}
            className="sm:flex-1"
            helperText="resources.tax_rates.helpers.rate"
          />
          <NumberInput
            source="rank"
            defaultValue={0}
            className="sm:w-32"
            helperText={false}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <BooleanInput
            source="is_default"
            defaultValue={false}
            helperText={false}
          />
          <BooleanInput
            source="active"
            defaultValue={true}
            helperText={false}
          />
        </div>
      </FormSection>
    </div>
  );
};
