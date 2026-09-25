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
      // Wider than a plain form: the tables under it need the room.
      contentClassName="max-w-6xl"
      redirect={false}
      mutationMode="pessimistic"
      mutationOptions={{ onError }}
      // No delete anywhere in the catalogue (Phase 3): a list a quote was
      // priced from is what makes that quote's figures explicable. The kit's
      // default header renders a `DeleteButton` that consults nothing, so the
      // absence has to be stated here rather than left to `canAccess`.
      actions={<></>}
    >
      <SimpleForm>
        <PriceListInputs />
      </SimpleForm>
      <div className="mt-6 flex flex-col gap-6">
        <PriceListItems />
      </div>
    </Edit>
  );
};
