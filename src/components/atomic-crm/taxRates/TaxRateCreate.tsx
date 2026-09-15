import { Create } from "@/components/admin/create";
import { SimpleForm } from "@/components/admin/simple-form";

import { useConflictNotifier } from "../misc/useConflictNotifier";
import { TaxRateInputs } from "./TaxRateInputs";

export const TaxRateCreate = () => {
  const onError = useConflictNotifier("resources.tax_rates.errors.conflict");

  return (
    <Create redirect="list" mutationOptions={{ onError }}>
      <SimpleForm>
        <TaxRateInputs />
      </SimpleForm>
    </Create>
  );
};
