import { EditBase, Form } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { FormToolbar } from "../layout/FormToolbar";
import { LeadInputs } from "./LeadInputs";

export const LeadEdit = () => (
  <EditBase redirect="show" mutationMode="pessimistic">
    <div className="mt-2 flex">
      <div className="flex-1">
        <Form>
          <Card>
            <CardContent>
              <LeadInputs />
              <FormToolbar />
            </CardContent>
          </Card>
        </Form>
      </div>
    </div>
  </EditBase>
);
