import { CreateBase, Form, useGetIdentity, useTranslate } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { FORM_EDGE_CLASS } from "@/components/admin/simple-form";

import { CompanyInputs } from "./CompanyInputs";
import { FormPageHeader } from "../misc/FormPageHeader";
import { FormToolbar } from "../layout/FormToolbar";
import { FormPage } from "../misc/FormPage";

export const CompanyCreate = () => {
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  return (
    <CreateBase
      redirect="show"
      transform={(values) => {
        // add https:// before website if not present
        if (values.website && !values.website.startsWith("http")) {
          values.website = `https://${values.website}`;
        }
        return values;
      }}
    >
      <FormPage>
        <FormPageHeader mode="create" />
        <div className="flex">
          <div className="flex-1">
            <Form defaultValues={{ sales_id: identity?.id }}>
              <Card className={FORM_EDGE_CLASS}>
                <CardContent>
                  <CompanyInputs />
                  <FormToolbar
                    saveLabel={translate("resources.companies.action.create", {
                      _: "Create Company",
                    })}
                  />
                </CardContent>
              </Card>
            </Form>
          </div>
        </div>
      </FormPage>
    </CreateBase>
  );
};
