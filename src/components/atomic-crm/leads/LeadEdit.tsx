import { EditBase, Form, useRecordContext, useTranslate } from "ra-core";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FORM_EDGE_CLASS } from "@/components/admin/simple-form";

import { FormToolbar } from "../layout/FormToolbar";
import { FormPage } from "../misc/FormPage";
import { FormPageHeader } from "../misc/FormPageHeader";
import type { Lead } from "../types";
import { ConvertedSummary } from "./ConvertedSummary";
import { LeadInputs } from "./LeadInputs";

export const LeadEdit = () => (
  <EditBase redirect="show" mutationMode="pessimistic">
    <FormPage>
      <FormPageHeader mode="edit" />
      <div className="flex">
        <div className="flex-1">
          <LeadEditContent />
        </div>
      </div>
    </FormPage>
  </EditBase>
);

/**
 * A converted lead is no longer edited: its status select has no "converted"
 * option, so the form showed a required field empty, and changes to it reach
 * nothing it produced. The page says so and links to the records to edit
 * instead (reached from an old link or a bookmark; the show page no longer
 * offers "Edit").
 */
const LeadEditContent = () => {
  const record = useRecordContext<Lead>();
  const translate = useTranslate();

  if (record?.converted_at) {
    return (
      <Card className={FORM_EDGE_CLASS}>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm">
            {translate("resources.leads.convert.read_only")}
          </p>
          <ConvertedSummary record={record} />
          <div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/leads/${record.id}/show`}>
                {translate("ra.action.back")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form>
      <Card className={FORM_EDGE_CLASS}>
        <CardContent>
          <LeadInputs />
          <FormToolbar />
        </CardContent>
      </Card>
    </Form>
  );
};
