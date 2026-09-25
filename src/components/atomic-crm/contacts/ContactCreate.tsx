import { CreateBase, Form, useGetIdentity, type MutationMode } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { FORM_EDGE_CLASS } from "@/components/admin/simple-form";

import { ContactInputs } from "./ContactInputs";
import { FormToolbar } from "../layout/FormToolbar";
import {
  cleanupContactForCreate,
  defaultEmailJsonb,
  defaultPhoneJsonb,
} from "./contactModel";
import { FormPageHeader } from "../misc/FormPageHeader";
import { FormPage } from "../misc/FormPage";

export const ContactCreate = ({
  mutationMode,
}: {
  mutationMode?: MutationMode;
}) => {
  const { identity } = useGetIdentity();

  return (
    <CreateBase
      redirect="show"
      transform={cleanupContactForCreate}
      mutationMode={mutationMode}
    >
      {/* A centred column the width of the two input columns, not the whole
          screen: a form stretched across 1600px is read like a table. */}
      <FormPage>
        <FormPageHeader mode="create" />
        <div className="flex">
          <div className="flex-1">
            <Form
              defaultValues={{
                sales_id: identity?.id,
                email_jsonb: defaultEmailJsonb,
                phone_jsonb: defaultPhoneJsonb,
              }}
            >
              <Card className={FORM_EDGE_CLASS}>
                <CardContent>
                  <ContactInputs />
                  <FormToolbar />
                </CardContent>
              </Card>
            </Form>
          </div>
        </div>
      </FormPage>
    </CreateBase>
  );
};
