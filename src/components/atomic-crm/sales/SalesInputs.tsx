import {
  email,
  required,
  useGetIdentity,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { ShieldCheck, UserRound } from "lucide-react";
import { BooleanInput } from "@/components/admin/boolean-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

import { FormSection } from "../misc/FormSection";
import type { Sale } from "../types";
import { roleChoices } from "./roles";

export function SalesInputs() {
  const { identity } = useGetIdentity();
  const record = useRecordContext<Sale>();
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-10 w-full">
      <FormSection
        icon={UserRound}
        title={translate("resources.sales.field_categories.person")}
        description={translate("crm.form_section.sale_identity")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            source="first_name"
            validate={required()}
            helperText={false}
          />
          <TextInput
            source="last_name"
            validate={required()}
            helperText={false}
          />
        </div>
        <TextInput
          source="email"
          validate={[required(), email()]}
          helperText={false}
        />
      </FormSection>

      <FormSection
        icon={ShieldCheck}
        title={translate("resources.sales.field_categories.access")}
        description={translate("crm.form_section.sale_access")}
      >
        <SelectInput
          source="role"
          choices={roleChoices}
          validate={required()}
          // Users cannot change their own role, which would let the last admin
          // lock everybody out of user management.
          readOnly={record?.id === identity?.id}
          helperText={false}
        />
        <BooleanInput
          source="disabled"
          readOnly={record?.id === identity?.id}
          helperText={false}
        />
      </FormSection>
    </div>
  );
}
