import { Gauge, UserRound } from "lucide-react";
import { email, required, useTranslate } from "ra-core";
import { NumberInput } from "@/components/admin/number-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";

import { AutocompleteCompanyInput } from "../companies/AutocompleteCompanyInput";
import { SaleInput } from "../misc/SaleInput";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { FormSection } from "../misc/FormSection";
import { validateLeadIdentity } from "./leadIdentity";

export const LeadInputs = () => {
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col gap-8 w-full">
      <div className={`flex gap-6 ${isMobile ? "flex-col" : "flex-row"}`}>
        <LeadIdentityInputs />
        <Separator orientation={isMobile ? "horizontal" : "vertical"} />
        <LeadQualificationInputs />
      </div>
    </div>
  );
};

const LeadIdentityInputs = () => {
  const translate = useTranslate();
  return (
    <FormSection
      icon={UserRound}
      title={translate("resources.leads.field_categories.identity")}
      description={translate("crm.form_section.identity")}
      className="flex-1"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          source="first_name"
          validate={validateLeadIdentity}
          helperText={false}
        />
        <TextInput source="last_name" helperText={false} />
        <TextInput source="email" validate={email()} helperText={false} />
        <TextInput source="phone" helperText={false} />
      </div>
      {/* Two ways to say "which company", because a lead can arrive either
          way. The link wins on conversion; the free-text name is what a web
          form gives you before anybody has qualified the lead. */}
      <ReferenceInput source="company_id" reference="companies" perPage={10}>
        <AutocompleteCompanyInput label="resources.leads.fields.company_id" />
      </ReferenceInput>
      <TextInput
        source="company_name"
        helperText={translate("resources.leads.company_name_helper")}
      />
      <TextInput source="title" helperText={false} />
    </FormSection>
  );
};

const LeadQualificationInputs = () => {
  const translate = useTranslate();
  const { leadSources, leadStatuses } = useConfigurationContext();
  return (
    <FormSection
      icon={Gauge}
      title={translate("resources.leads.field_categories.qualification")}
      description={translate("crm.form_section.qualification")}
      className="flex-1"
    >
      <SelectInput
        source="status"
        choices={leadStatuses}
        optionText="label"
        optionValue="value"
        defaultValue="new"
        validate={required()}
        helperText={false}
      />
      <SelectInput
        source="source"
        choices={leadSources}
        optionText="label"
        optionValue="value"
        helperText={false}
      />
      <NumberInput source="score" min={0} max={100} helperText={false} />
      <TextInput source="notes" multiline helperText={false} />
      <SaleInput />
    </FormSection>
  );
};
