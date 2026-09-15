import { Create } from "@/components/admin/create";
import { SimpleForm } from "@/components/admin/simple-form";

import { useConflictNotifier } from "../misc/useConflictNotifier";
import { PriceListInputs } from "./PriceListInputs";

/** Lands on the edit page, which is where the list's prices are added. */
export const PriceListCreate = () => {
  const onError = useConflictNotifier("resources.price_lists.errors.conflict");

  return (
    <Create redirect="edit" mutationOptions={{ onError }}>
      <SimpleForm>
        <PriceListInputs />
      </SimpleForm>
    </Create>
  );
};
