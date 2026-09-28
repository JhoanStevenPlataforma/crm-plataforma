import {
  AtSign,
  BriefcaseBusiness,
  NotebookPen,
  UserRound,
} from "lucide-react";
import {
  email,
  required,
  useRecordContext,
  useTranslate,
  useUpdate,
  useNotify,
} from "ra-core";
import type { FocusEvent, ClipboardEventHandler } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";
import { BooleanInput } from "@/components/admin/boolean-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { TextInput } from "@/components/admin/text-input";
import { RadioButtonGroupInput } from "@/components/admin/radio-button-group-input";
import { SelectInput } from "@/components/admin/select-input";
import { ArrayInput } from "@/components/admin/array-input";
import { SimpleFormIterator } from "@/components/admin/simple-form-iterator";

import { isLinkedinUrl } from "../misc/isLinkedInUrl";
import { SaleInput } from "../misc/SaleInput";
import { StatusSelector } from "../notes";
import type { Contact } from "../types";
import { Avatar } from "./Avatar";
import { AutocompleteCompanyInput } from "../companies/AutocompleteCompanyInput.tsx";
import {
  contactGender,
  translateContactGenderLabel,
  translatePersonalInfoTypeLabel,
} from "./contactModel.ts";
import { FormSection } from "../misc/FormSection";
import { DuplicateHint } from "../misc/DuplicateHint";
import { contactDisplayName } from "./contactName";

export const ContactInputs = () => {
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col gap-2 p-1 relative md:static">
      <div className="absolute top-0 right-1 md:static">
        <Avatar />
      </div>
      <div className="flex gap-10 md:gap-6 flex-col md:flex-row">
        <div className="flex flex-col gap-10 flex-1">
          <ContactIdentityInputs />
          <ContactPositionInputs />
        </div>
        {isMobile ? null : (
          <Separator orientation="vertical" className="flex-shrink-0" />
        )}
        <div className="flex flex-col gap-10 flex-1">
          <ContactPersonalInformationInputs />
          <ContactMiscInputs />
        </div>
      </div>
    </div>
  );
};

/**
 * Offered when creating a contact: male and female. "Non-binary" stays a valid
 * stored value (imports, older records), so a contact that already carries it
 * still shows it when edited instead of silently losing the choice.
 */
const OFFERED_GENDERS = ["male", "female"];

const ContactIdentityInputs = () => {
  const translate = useTranslate();
  const record = useRecordContext<Contact>();
  const genders = contactGender.filter(
    (gender) =>
      OFFERED_GENDERS.includes(gender.value) || gender.value === record?.gender,
  );
  return (
    <FormSection
      icon={UserRound}
      title={translate("resources.contacts.field_categories.identity")}
      description={translate("crm.form_section.identity")}
    >
      <RadioButtonGroupInput
        label={false}
        row
        source="gender"
        choices={genders}
        helperText={false}
        optionText={(choice) => translateContactGenderLabel(choice, translate)}
        translateChoice={false}
        optionValue="value"
        defaultValue={contactGender[0].value}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          source="first_name"
          validate={required()}
          helperText={false}
        />
        <TextInput
          source="last_name"
          validate={required()}
          helperText={false}
        />
      </div>
    </FormSection>
  );
};

const ContactPositionInputs = () => {
  const translate = useTranslate();
  return (
    <FormSection
      icon={BriefcaseBusiness}
      title={translate("resources.contacts.field_categories.position")}
      description={translate("crm.form_section.position")}
    >
      <TextInput source="title" helperText={false} />
      <ReferenceInput source="company_id" reference="companies" perPage={10}>
        <AutocompleteCompanyInput label="resources.contacts.fields.company_id" />
      </ReferenceInput>
    </FormSection>
  );
};

const ContactPersonalInformationInputs = () => {
  const translate = useTranslate();
  const { getValues, setValue } = useFormContext();
  const personalInfoTypes = [
    {
      id: "Work",
      name: translatePersonalInfoTypeLabel("Work", translate),
    },
    {
      id: "Home",
      name: translatePersonalInfoTypeLabel("Home", translate),
    },
    {
      id: "Other",
      name: translatePersonalInfoTypeLabel("Other", translate),
    },
  ];

  // set first and last name based on email
  const handleEmailChange = (email: string) => {
    const { first_name, last_name } = getValues();
    if (first_name || last_name || !email) return;
    const [first, last] = email.split("@")[0].split(".");
    setValue("first_name", first.charAt(0).toUpperCase() + first.slice(1));
    setValue(
      "last_name",
      last ? last.charAt(0).toUpperCase() + last.slice(1) : "",
    );
  };

  const handleEmailPaste: ClipboardEventHandler<
    HTMLTextAreaElement | HTMLInputElement
  > = (e) => {
    const email = e.clipboardData?.getData("text/plain");
    handleEmailChange(email);
  };

  const handleEmailBlur = (
    e: FocusEvent<HTMLTextAreaElement | HTMLInputElement>,
  ) => {
    const email = e.target.value;
    handleEmailChange(email);
  };

  return (
    <FormSection
      icon={AtSign}
      title={translate("resources.contacts.field_categories.personal_info")}
      description={translate("crm.form_section.reach")}
    >
      <ArrayInput source="email_jsonb" helperText={false}>
        <SimpleFormIterator
          inline
          disableReordering
          disableClear
          className="[&>ul>li]:border-b-0 [&>ul>li]:pb-0"
        >
          <TextInput
            source="email"
            className="w-full"
            helperText={false}
            label={false}
            placeholder={translate("resources.contacts.fields.email")}
            validate={email()}
            onPaste={handleEmailPaste}
            onBlur={handleEmailBlur}
          />
          <SelectInput
            source="type"
            helperText={false}
            label={false}
            optionText="name"
            choices={personalInfoTypes}
            defaultValue="Work"
            className="w-32 min-w-32"
          />
        </SimpleFormIterator>
      </ArrayInput>
      <ContactDuplicateHint />
      <ArrayInput source="phone_jsonb" helperText={false}>
        <SimpleFormIterator
          inline
          disableReordering
          disableClear
          className="[&>ul>li]:border-b-0 [&>ul>li]:pb-0"
        >
          <TextInput
            source="number"
            className="w-full"
            helperText={false}
            label={false}
            placeholder={translate("resources.contacts.fields.phone_number")}
          />
          <SelectInput
            source="type"
            helperText={false}
            label={false}
            optionText="name"
            choices={personalInfoTypes}
            defaultValue="Work"
            className="w-32 min-w-32"
          />
        </SimpleFormIterator>
      </ArrayInput>
      <TextInput
        source="linkedin_url"
        helperText={false}
        validate={isLinkedinUrl}
      />
    </FormSection>
  );
};

const ContactMiscInputs = () => {
  const translate = useTranslate();
  return (
    <FormSection
      icon={NotebookPen}
      title={translate("resources.contacts.field_categories.misc")}
      description={translate("crm.form_section.contact_misc")}
    >
      <TextInput source="background" multiline helperText={false} />
      <BooleanInput source="has_newsletter" helperText={false} />
      <SaleInput />
    </FormSection>
  );
};

export const ContactStatusSelector = () => {
  const record = useRecordContext<Contact>();
  const [update] = useUpdate<Contact>();
  const notify = useNotify();
  if (!record) return null;

  const handleStatusChange = (nextStatus: string) => {
    if (nextStatus === record?.status) return;

    update(
      "contacts",
      {
        id: record.id,
        data: { status: nextStatus },
        previousData: record,
      },
      {
        mutationMode: "optimistic",
        onError: (error) => {
          notify(
            typeof error === "string"
              ? error
              : error?.message || "ra.notification.http_error",
            {
              type: "error",
              messageArgs: {
                _: typeof error === "string" ? error : error?.message,
              },
            },
          );
        },
      },
    );
  };

  return (
    <div className="[&_button]:w-auto">
      <StatusSelector
        status={record?.status}
        setStatus={handleStatusChange}
        triggerClassName="w-full"
      />
    </div>
  );
};

const ContactDuplicateHint = () => {
  const emails = useWatch({ name: "email_jsonb" }) as
    | { email?: string }[]
    | undefined;
  return (
    <DuplicateHint<Contact>
      resource="contacts"
      value={emails?.find((entry) => entry?.email)?.email}
      isSame={(contact, typed) =>
        (contact.email_jsonb ?? []).some(
          (entry) => entry.email?.trim().toLowerCase() === typed.toLowerCase(),
        )
      }
      labelOf={contactDisplayName}
      messageKey="crm.duplicates.contact_exists"
    />
  );
};
