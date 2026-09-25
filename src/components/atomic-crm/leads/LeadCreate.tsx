import { CreateBase, Form, useGetIdentity } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { FORM_EDGE_CLASS } from "@/components/admin/simple-form";

import { FormToolbar } from "../layout/FormToolbar";
import { FormPage } from "../misc/FormPage";
import { FormPageHeader } from "../misc/FormPageHeader";
import { LeadInputs } from "./LeadInputs";

export const LeadCreate = () => {
  const { identity } = useGetIdentity();

  return (
    <CreateBase redirect="show">
      <FormPage>
        <FormPageHeader mode="create" />
        <div className="flex">
          <div className="flex-1">
            <Form defaultValues={{ sales_id: identity?.id, status: "new" }}>
              <Card className={FORM_EDGE_CLASS}>
                <CardContent>
                  <LeadInputs />
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
