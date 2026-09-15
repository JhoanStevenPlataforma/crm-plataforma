import { Create } from "@/components/admin/create";
import { SimpleForm } from "@/components/admin/simple-form";

import { useConflictNotifier } from "../misc/useConflictNotifier";
import { ProductInputs } from "./ProductInputs";

export const ProductCreate = () => {
  const onError = useConflictNotifier(
    "resources.products.errors.duplicate_sku",
  );

  return (
    <Create redirect="list" mutationOptions={{ onError }}>
      <SimpleForm>
        <ProductInputs />
      </SimpleForm>
    </Create>
  );
};
