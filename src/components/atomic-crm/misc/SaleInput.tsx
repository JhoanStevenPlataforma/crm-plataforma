import { useCanAccess, useResourceContext } from "ra-core";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";

import { ASSIGN_ACTION } from "../providers/commons/canAccess";
import type { Sale } from "../types";

const saleOptionRenderer = (choice: Sale) =>
  `${choice.first_name} ${choice.last_name}`;

export interface SaleInputProps {
  source?: string;
}

/**
 * The "account manager" (owner) input, shared by the contact, company and deal
 * forms.
 *
 * Read-only unless the current user is allowed to reassign records. Row level
 * security rejects an owner change coming from a sales rep, so leaving the
 * field editable for them would only ever produce a failed save.
 */
export const SaleInput = ({ source = "sales_id" }: SaleInputProps) => {
  const resource = useResourceContext();
  const { canAccess } = useCanAccess({
    action: ASSIGN_ACTION,
    resource: resource ?? "",
  });

  return (
    <ReferenceInput
      source={source}
      reference="sales"
      sort={{ field: "last_name", order: "ASC" }}
      filter={{ "disabled@neq": true }}
    >
      {/* `canAccess` is undefined while the check is in flight: stay read-only
          until we positively know the user may reassign. */}
      <SelectInput
        helperText={false}
        optionText={saleOptionRenderer}
        readOnly={canAccess !== true}
      />
    </ReferenceInput>
  );
};
