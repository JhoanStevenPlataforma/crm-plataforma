import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";

import { useConflictNotifier } from "../misc/useConflictNotifier";
import { PriceListInputs } from "./PriceListInputs";
import { PriceListItems } from "./PriceListItems";

/**
 * The prices sit outside the form on purpose, as a team's members do: each one
 * is saved the moment it is added, and sharing the list's Save button would
 * suggest the two are one write when they are not.
 *
 * Pessimistic, so a code or a per-currency default that is already taken is
 * reported while the form is still open.
 */
export const PriceListEdit = () => {
  const onError = useConflictNotifier("resources.price_lists.errors.conflict");

  return (
    <Edit
      redirect={false}
      mutationMode="pessimistic"
      mutationOptions={{ onError }}
    >
      <SimpleForm>
        <PriceListInputs />
      </SimpleForm>
      <div className="p-4 pt-0 flex flex-col gap-6">
        <PriceListItems />
      </div>
    </Edit>
  );
};
