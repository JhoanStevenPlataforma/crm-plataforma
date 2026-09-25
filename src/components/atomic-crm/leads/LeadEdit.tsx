import { EditBase, Form } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { FORM_EDGE_CLASS } from "@/components/admin/simple-form";

import { FormToolbar } from "../layout/FormToolbar";
import { FormPage } from "../misc/FormPage";
import { FormPageHeader } from "../misc/FormPageHeader";
import { LeadInputs } from "./LeadInputs";

export const LeadEdit = () => (
  <EditBase redirect="show" mutationMode="pessimistic">
    <FormPage>
      <FormPageHeader mode="edit" />
      <div className="flex">
        <div className="flex-1">
          <Form>
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
  </EditBase>
);
