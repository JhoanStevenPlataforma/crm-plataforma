import { Card, CardContent } from "@/components/ui/card";
import { FORM_EDGE_CLASS } from "@/components/admin/simple-form";
import { EditBase, Form, useEditContext, type MutationMode } from "ra-core";

import type { Contact } from "../types";
import { ContactAside } from "./ContactAside";
import { ContactInputs } from "./ContactInputs";
import { FormToolbar } from "../layout/FormToolbar";
import {
  cleanupContactForEdit,
  defaultEmailJsonb,
  defaultPhoneJsonb,
} from "./contactModel";
import { FormPageHeader } from "../misc/FormPageHeader";
import { FormPage } from "../misc/FormPage";

export const ContactEdit = ({
  mutationMode,
}: {
  mutationMode?: MutationMode;
}) => (
  <EditBase
    redirect="show"
    transform={cleanupContactForEdit}
    mutationMode={mutationMode}
  >
    <ContactEditContent />
  </EditBase>
);

const normalizeContactArrayFields = (record: Contact) => ({
  ...record,
  email_jsonb:
    record.email_jsonb && record.email_jsonb.length > 0
      ? record.email_jsonb
      : defaultEmailJsonb,
  phone_jsonb:
    record.phone_jsonb && record.phone_jsonb.length > 0
      ? record.phone_jsonb
      : defaultPhoneJsonb,
});

const ContactEditContent = () => {
  const { isPending, record } = useEditContext<Contact>();
  if (isPending || !record) return null;
  return (
    <FormPage wide>
      <FormPageHeader mode="edit" />
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <Form
          className="flex min-w-0 flex-1 flex-col gap-4"
          record={normalizeContactArrayFields(record)}
        >
          <Card className={FORM_EDGE_CLASS}>
            <CardContent>
              <ContactInputs />
              <FormToolbar />
            </CardContent>
          </Card>
        </Form>

        <ContactAside link="show" />
      </div>
    </FormPage>
  );
};
