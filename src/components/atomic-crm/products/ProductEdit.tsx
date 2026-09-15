import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";

import { useConflictNotifier } from "../misc/useConflictNotifier";
import { ProductInputs } from "./ProductInputs";

/**
 * Pessimistic rather than the default undoable save: the realistic failure here
 * is a SKU another product already uses, and an undoable save would close the
 * form before the database had the chance to say so.
 */
export const ProductEdit = () => {
  const onError = useConflictNotifier(
    "resources.products.errors.duplicate_sku",
  );

  return (
    <Edit
      redirect="list"
      mutationMode="pessimistic"
      mutationOptions={{ onError }}
    >
      <SimpleForm>
        <ProductInputs />
      </SimpleForm>
    </Edit>
  );
};
