import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";

import { useConflictNotifier } from "../misc/useConflictNotifier";
import { TaxRateInputs } from "./TaxRateInputs";

/** Pessimistic, so a code or a default that is already taken is reported in the form. */
export const TaxRateEdit = () => {
  const onError = useConflictNotifier("resources.tax_rates.errors.conflict");

  return (
    <Edit
      redirect="list"
      mutationMode="pessimistic"
      mutationOptions={{ onError }}
      // No delete: a rate is referenced by every line that ever froze it, and
      // the seeded rows are reference data. Stated here because the kit's
      // default header offers one regardless of `canAccess`.
      actions={<></>}
    >
      <SimpleForm>
        <TaxRateInputs />
      </SimpleForm>
    </Edit>
  );
};
