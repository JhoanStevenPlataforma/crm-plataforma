import { CreateBase, Form, useGetIdentity } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { FormToolbar } from "../layout/FormToolbar";
import { LeadInputs } from "./LeadInputs";

export const LeadCreate = () => {
  const { identity } = useGetIdentity();

  return (
    <CreateBase redirect="show">
      <div className="mt-2 flex">
        <div className="flex-1">
          <Form defaultValues={{ sales_id: identity?.id, status: "new" }}>
            <Card>
              <CardContent>
                <LeadInputs />
                <FormToolbar />
              </CardContent>
            </Card>
          </Form>
        </div>
      </div>
    </CreateBase>
  );
};
