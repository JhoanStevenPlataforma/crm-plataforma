import { Building2, Factory, MapPin, NotebookPen } from "lucide-react";
import { required, useRecordContext, useTranslate } from "ra-core";
import { TextInput } from "@/components/admin/text-input";
import { SelectInput } from "@/components/admin/select-input";
import { ArrayInput } from "@/components/admin/array-input";
import { SimpleFormIterator } from "@/components/admin/simple-form-iterator";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";

import ImageEditorField from "../misc/ImageEditorField";
import { isLinkedinUrl } from "../misc/isLinkedInUrl";
import { SaleInput } from "../misc/SaleInput";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company } from "../types";
import { getTranslatedCompanySizeLabel } from "./getTranslatedCompanySizeLabel";
import { sizes } from "./sizes";
import { FormSection } from "../misc/FormSection";
import { DuplicateHint } from "../misc/DuplicateHint";
import { isPhoneNumber, isRevenue } from "../misc/fieldValidators";
import { useWatch } from "react-hook-form";

const isUrl = (url: string) => {
  if (!url) return;
  const UrlRegex = new RegExp(
    /^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/i,
  );
  if (!UrlRegex.test(url)) {
    return {
      message: "crm.validation.invalid_url",
      args: { _: "Must be a valid URL" },
    };
  }
};

export const CompanyInputs = () => {
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col gap-4 p-1">
      <CompanyDisplayInputs />
      <div className={`flex gap-6 ${isMobile ? "flex-col" : "flex-row"}`}>
        <div className="flex flex-col gap-10 flex-1">
          <CompanyContactInputs />
          <CompanyContextInputs />
        </div>
        <Separator orientation={isMobile ? "horizontal" : "vertical"} />
        <div className="flex flex-col gap-8 flex-1">
          <CompanyAddressInputs />
          <CompanyAdditionalInformationInputs />
        </div>
      </div>
    </div>
  );
};

const CompanyDisplayInputs = () => {
  const translate = useTranslate();
  const record = useRecordContext<Company>();
  return (
    <div className="flex gap-4 flex-1 flex-row">
      <ImageEditorField
        source="logo"
        type="avatar"
        width={60}
        height={60}
        emptyText={record?.name.charAt(0)}
        linkPosition="bottom"
      />
      <TextInput
        source="name"
        className="w-full h-fit"
        validate={required()}
        helperText={false}
        placeholder={translate("resources.companies.fields.name", {
          _: "Company name",
        })}
      />
      <CompanyDuplicateHint />
    </div>
  );
};

const CompanyContactInputs = () => {
  const translate = useTranslate();
  return (
    <FormSection
      icon={Building2}
      title={translate("resources.companies.field_categories.contact", {
        _: "Company info",
      })}
      description={translate("crm.form_section.company_contact")}
    >
      <TextInput source="website" helperText={false} validate={isUrl} />
      <TextInput
        source="linkedin_url"
        helperText={false}
        validate={isLinkedinUrl}
      />
      <TextInput
        source="phone_number"
        helperText={false}
        validate={isPhoneNumber}
      />
    </FormSection>
  );
};

const CompanyContextInputs = () => {
  const translate = useTranslate();
  const { companySectors } = useConfigurationContext();
  const translatedSizes = sizes.map((size) => ({
    ...size,
    name: getTranslatedCompanySizeLabel(size, translate),
  }));
  return (
    <FormSection
      icon={Factory}
      title={translate("resources.companies.field_categories.context", {
        _: "Context",
      })}
      description={translate("crm.form_section.company_context")}
    >
      <SelectInput
        source="sector"
        choices={companySectors}
        optionText="label"
        optionValue="value"
        helperText={false}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          source="size"
          choices={translatedSizes}
          helperText={false}
        />
        <TextInput source="revenue" helperText={false} validate={isRevenue} />
      </div>
      <TextInput source="tax_identifier" helperText={false} />
    </FormSection>
  );
};

const CompanyAddressInputs = () => {
  const translate = useTranslate();
  return (
    <FormSection
      icon={MapPin}
      title={translate("resources.companies.field_categories.address", {
        _: "Address",
      })}
      description={translate("crm.form_section.address")}
    >
      <TextInput source="address" helperText={false} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput source="city" helperText={false} />
        <TextInput source="zipcode" helperText={false} />
        <TextInput source="state_abbr" helperText={false} />
        <TextInput source="country" helperText={false} />
      </div>
    </FormSection>
  );
};

const CompanyAdditionalInformationInputs = () => {
  const translate = useTranslate();
  return (
    <FormSection
      icon={NotebookPen}
      title={translate("resources.companies.field_categories.additional_info", {
        _: "Additional information",
      })}
      description={translate("crm.form_section.company_misc")}
    >
      <TextInput source="description" multiline helperText={false} />
      <ArrayInput source="context_links" helperText={false}>
        <SimpleFormIterator disableReordering fullWidth getItemLabel={false}>
          <TextInput
            source=""
            label={false}
            helperText={false}
            validate={isUrl}
          />
        </SimpleFormIterator>
      </ArrayInput>
      <SaleInput />
    </FormSection>
  );
};

const CompanyDuplicateHint = () => {
  const name = useWatch({ name: "name" });
  return (
    <DuplicateHint<Company>
      resource="companies"
      value={name}
      isSame={(company, typed) =>
        company.name?.trim().toLowerCase() === typed.toLowerCase()
      }
      labelOf={(company) => company.name}
      messageKey="crm.duplicates.company_exists"
    />
  );
};
