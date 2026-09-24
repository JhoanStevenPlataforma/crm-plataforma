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
      // No delete, and it has to be said HERE: the kit's default header
      // renders a `DeleteButton` that consults nothing, so `canAccess`
      // refusing `products/delete` for every role does not remove it. Every
      // product has append-only history, so the database refuses the delete
      // too (quotes 13.2) -- the button could only ever fail. A product that
      // is no longer sold is deactivated, which is the `is_active` control
      // in the form below.
      actions={<></>}
    >
      <SimpleForm>
        <ProductInputs />
      </SimpleForm>
    </Edit>
  );
};
