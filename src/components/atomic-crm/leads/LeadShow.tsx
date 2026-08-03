import { ShowBase, useRecordContext, useTranslate } from "ra-core";
import { Link } from "react-router";
import { DeleteButton } from "@/components/admin/delete-button";
import { EditButton } from "@/components/admin/edit-button";
import { ReferenceField } from "@/components/admin/reference-field";
import { Card, CardContent } from "@/components/ui/card";

import { TopToolbar } from "../layout/TopToolbar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Lead } from "../types";
import { ConvertLeadButton } from "./ConvertLeadButton";
import { LeadCompanyField } from "./LeadCompanyField";
import { LeadStatusBadge } from "./LeadStatusBadge";

export const LeadShow = () => (
  <ShowBase>
    <LeadShowContent />
  </ShowBase>
);

const LeadShowContent = () => {
  const record = useRecordContext<Lead>();
  const translate = useTranslate();
  const { leadStatuses, leadSources } = useConfigurationContext();

  if (!record) return null;

  const fullName =
    `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim() ||
    translate("resources.leads.unnamed");

  return (
    <div className="mt-2 flex flex-col gap-4">
      <TopToolbar>
        <ConvertLeadButton />
        <EditButton />
        <DeleteButton />
      </TopToolbar>

      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">{fullName}</h2>
            <LeadStatusBadge choices={leadStatuses} />
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Row label="resources.leads.fields.company">
              <LeadCompanyField />
            </Row>
            <Row label="resources.leads.fields.title">{record.title}</Row>
            <Row label="resources.leads.fields.email">{record.email}</Row>
            <Row label="resources.leads.fields.phone">{record.phone}</Row>
            <Row label="resources.leads.fields.source">
              {leadSources.find((choice) => choice.value === record.source)
                ?.label ?? record.source}
            </Row>
            <Row label="resources.leads.fields.score">
              {record.score != null ? String(record.score) : undefined}
            </Row>
            <Row label="resources.leads.fields.sales_id">
              <ReferenceField source="sales_id" reference="sales" />
            </Row>
          </dl>

          {record.notes ? (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                {translate("resources.leads.fields.notes")}
              </h3>
              <p className="text-sm whitespace-pre-line">{record.notes}</p>
            </div>
          ) : null}

          {record.converted_at ? <ConvertedSummary record={record} /> : null}
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Once converted, the lead becomes an audit trail: it shows what it produced
 * rather than offering the conversion again.
 */
const ConvertedSummary = ({ record }: { record: Lead }) => {
  const translate = useTranslate();
  return (
    <div className="border-t pt-4 flex flex-col gap-1 text-sm">
      <h3 className="text-sm font-medium text-muted-foreground">
        {translate("resources.leads.convert.converted_title")}
      </h3>
      {record.converted_contact_id ? (
        <Link
          className="underline"
          to={`/contacts/${record.converted_contact_id}/show`}
        >
          {translate("resources.leads.convert.see_contact")}
        </Link>
      ) : null}
      {record.converted_company_id ? (
        <Link
          className="underline"
          to={`/companies/${record.converted_company_id}/show`}
        >
          {translate("resources.leads.convert.see_company")}
        </Link>
      ) : null}
      {record.converted_deal_id ? (
        <Link className="underline" to={`/deals/${record.converted_deal_id}`}>
          {translate("resources.leads.convert.see_deal")}
        </Link>
      ) : null}
    </div>
  );
};

const Row = ({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) => {
  const translate = useTranslate();
  if (children == null || children === "") return null;
  return (
    <div>
      <dt className="text-muted-foreground">{translate(label)}</dt>
      <dd>{children}</dd>
    </div>
  );
};
