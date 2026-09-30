import { EditBase, Form } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { FORM_EDGE_CLASS } from "@/components/admin/simple-form";

import { CompanyInputs } from "./CompanyInputs";
import { CompanyAside } from "./CompanyAside";
import { FormToolbar } from "../layout/FormToolbar";
import { FormPageHeader } from "../misc/FormPageHeader";
import { FormPage } from "../misc/FormPage";

export const CompanyEdit = () => (
  <EditBase
    actions={false}
    redirect="show"
    transform={(values) => {
      // add https:// before website if not present
      if (values.website && !values.website.startsWith("http")) {
        values.website = `https://${values.website}`;
      }
      return values;
    }}
  >
    <FormPage wide>
      <FormPageHeader mode="edit" />
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <Form className="flex min-w-0 flex-1 flex-col gap-4 pb-2">
          <Card className={FORM_EDGE_CLASS}>
            <CardContent>
              <CompanyInputs />
              <FormToolbar />
            </CardContent>
          </Card>
        </Form>

        <CompanyAside link="show" />
      </div>
    </FormPage>
  </EditBase>
);
