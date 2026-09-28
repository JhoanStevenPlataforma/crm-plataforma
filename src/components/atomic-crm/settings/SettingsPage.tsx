/* eslint-disable react-refresh/only-export-components */
import type { RaRecord } from "ra-core";
import { EditBase, Form, useGetList, useNotify, useTranslate } from "ra-core";
import { useCallback, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toSlug } from "@/lib/toSlug";
import { cn } from "@/lib/utils";
import { ArrayInput } from "@/components/admin/array-input";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { SimpleFormIterator } from "@/components/admin/simple-form-iterator";
import { TextInput } from "@/components/admin/text-input";

import { ColorInput } from "../misc/ColorInput";
import { DealQuoteStageRules } from "./DealQuoteStageRules";
import ImageEditorField from "../misc/ImageEditorField";
import {
  useStoredConfiguration,
  useConfigurationUpdater,
  type ConfigurationContextValue,
} from "../root/ConfigurationContext";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { useActiveSection } from "./useActiveSection";

const SECTIONS = [
  {
    id: "branding",
    label: "crm.settings.sections.branding",
    fallback: "Branding",
  },
  {
    id: "companies",
    label: "resources.companies.name",
    fallback: "Companies",
  },
  { id: "deals", label: "resources.deals.name", fallback: "Deals" },
  {
    id: "deal-quote-rules",
    label: "crm.settings.deal_quote_rules.title",
    fallback: "Pipeline and quotations",
  },
  { id: "notes", label: "resources.notes.name", fallback: "Notes" },
  { id: "tasks", label: "resources.tasks.name", fallback: "Tasks" },
  { id: "products", label: "resources.products.name", fallback: "Products" },
];

/** Ensure every item in a { value, label } array has a value (slug from label). */
const ensureValues = (items: { value?: string; label: string }[] | undefined) =>
  items?.map((item) => ({ ...item, value: item.value || toSlug(item.label) }));

type ValidateItemsInUseMessages = {
  duplicate?: (displayName: string, duplicates: string[]) => string;
  inUse?: (displayName: string, inUse: string[]) => string;
  validating?: string;
};

/**
 * Validate that no items were removed if they are still referenced by existing deals.
 * Also rejects duplicate slug values.
 * Returns undefined if valid, or an error message string.
 */
export const validateItemsInUse = (
  items: { value: string; label: string }[] | undefined,
  deals: RaRecord[] | undefined,
  fieldName: string,
  displayName: string,
  messages?: ValidateItemsInUseMessages,
) => {
  if (!items) return undefined;
  // Check for duplicate slugs
  const slugs = items.map((i) => i.value || toSlug(i.label));
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) duplicates.add(slug);
    seen.add(slug);
  }
  if (duplicates.size > 0) {
    const duplicatesList = [...duplicates];
    return (
      messages?.duplicate?.(displayName, duplicatesList) ??
      `Duplicate ${displayName}: ${duplicatesList.join(", ")}`
    );
  }
  // Check that no in-use value was removed (skip if deals haven't loaded)
  if (!deals) return messages?.validating ?? "Validating…";
  const values = new Set(slugs);
  const inUse = [
    ...new Set(
      deals
        .filter(
          (deal) => deal[fieldName] && !values.has(deal[fieldName] as string),
        )
        .map((deal) => deal[fieldName] as string),
    ),
  ];
  if (inUse.length > 0) {
    return (
      messages?.inUse?.(displayName, inUse) ??
      `Cannot remove ${displayName} that are still used by deals: ${inUse.join(", ")}`
    );
  }
  return undefined;
};

const getCurrencyChoices = () => {
  const displayNames = new Intl.DisplayNames(
    typeof navigator !== "undefined"
      ? (navigator.languages as string[])
      : ["en"],
    { type: "currency" },
  );
  return Intl.supportedValuesOf("currency").map((code) => ({
    id: code,
    name: `${code} – ${displayNames.of(code)}`,
  }));
};

const transformFormValues = (data: Record<string, any>) => ({
  config: {
    title: data.title,
    lightModeLogo: data.lightModeLogo,
    darkModeLogo: data.darkModeLogo,
    currency: data.currency,
    companySectors: ensureValues(data.companySectors),
    dealCategories: ensureValues(data.dealCategories),
    taskTypes: ensureValues(data.taskTypes),
    dealStages: ensureValues(data.dealStages),
    dealPipelineStatuses: data.dealPipelineStatuses,
    noteStatuses: ensureValues(data.noteStatuses),
    productUnits: ensureValues(data.productUnits),
    productCategories: ensureValues(data.productCategories),
  } as ConfigurationContextValue,
});

export const SettingsPage = () => {
  const updateConfiguration = useConfigurationUpdater();
  const notify = useNotify();

  return (
    <EditBase
      resource="configuration"
      id={1}
      mutationMode="pessimistic"
      redirect={false}
      transform={transformFormValues}
      mutationOptions={{
        onSuccess: (data: any) => {
          updateConfiguration(data.config);
          notify("crm.settings.saved");
        },
        onError: () => {
          notify("crm.settings.save_error", {
            type: "error",
          });
        },
      }}
    >
      <SettingsForm />
    </EditBase>
  );
};

SettingsPage.path = "/settings";

const SettingsForm = () => {
  const config = useStoredConfiguration();

  const defaultValues = useMemo(
    () => ({
      title: config.title,
      lightModeLogo: { src: config.lightModeLogo },
      darkModeLogo: { src: config.darkModeLogo },
      currency: config.currency,
      companySectors: config.companySectors,
      dealCategories: config.dealCategories,
      taskTypes: config.taskTypes,
      dealStages: config.dealStages,
      dealPipelineStatuses: config.dealPipelineStatuses,
      noteStatuses: config.noteStatuses,
      productUnits: config.productUnits,
      productCategories: config.productCategories,
    }),
    [config],
  );

  return (
    <Form defaultValues={defaultValues}>
      <SettingsFormFields />
    </Form>
  );
};

const SECTION_IDS = SECTIONS.map((section) => section.id);

const SettingsFormFields = () => {
  const translate = useTranslate();
  const activeSection = useActiveSection(SECTION_IDS);
  const currencyChoices = useMemo(() => getCurrencyChoices(), []);
  const { watch, setValue } = useFormContext();

  const dealStages = watch("dealStages");
  const dealPipelineStatuses: string[] = watch("dealPipelineStatuses") ?? [];
  const stageDisplayName = translate("crm.settings.validation.entities.stages");
  const categoryDisplayName = translate(
    "crm.settings.validation.entities.categories",
  );

  const { data: deals } = useGetList("deals", {
    pagination: { page: 1, perPage: 1000 },
  });

  const validateDealStages = useCallback(
    (stages: { value: string; label: string }[] | undefined) =>
      validateItemsInUse(stages, deals, "stage", stageDisplayName, {
        duplicate: (displayName, duplicates) =>
          translate("crm.settings.validation.duplicate", {
            display_name: displayName,
            items: duplicates.join(", "),
          }),
        inUse: (displayName, inUse) =>
          translate("crm.settings.validation.in_use", {
            display_name: displayName,
            items: inUse.join(", "),
          }),
        validating: translate("crm.settings.validation.validating"),
      }),
    [deals, stageDisplayName, translate],
  );

  const validateDealCategories = useCallback(
    (categories: { value: string; label: string }[] | undefined) =>
      validateItemsInUse(categories, deals, "category", categoryDisplayName, {
        duplicate: (displayName, duplicates) =>
          translate("crm.settings.validation.duplicate", {
            display_name: displayName,
            items: duplicates.join(", "),
          }),
        inUse: (displayName, inUse) =>
          translate("crm.settings.validation.in_use", {
            display_name: displayName,
            items: inUse.join(", "),
          }),
        validating: translate("crm.settings.validation.validating"),
      }),
    [categoryDisplayName, deals, translate],
  );

  return (
    <div className="flex gap-8 mt-4 pb-20">
      {/* Left navigation */}
      <nav className="hidden md:block w-48 shrink-0">
        {/* Below the sticky topbar (56px), not under it. */}
        <div className="sticky top-20 space-y-0.5">
          <h1 className="mb-3 px-3 text-2xl font-semibold tracking-tight">
            {translate("crm.settings.title")}
          </h1>
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                document
                  .getElementById(section.id)
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              aria-current={activeSection === section.id ? "true" : undefined}
              className={cn(
                "relative block w-full rounded-lg px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                activeSection === section.id &&
                  "bg-brand-tint font-medium text-brand-strong hover:bg-brand-tint hover:text-brand-strong",
              )}
            >
              {translate(section.label, { smart_count: 2 })}
            </button>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 min-w-0 max-w-2xl space-y-6">
        {/* Branding */}
        <Card id="branding" className="scroll-mt-20">
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">
              {translate("crm.settings.sections.branding")}
            </h2>
            <TextInput source="title" label="crm.settings.app_title" />
            <div className="flex gap-8">
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-muted-foreground">
                  {translate("crm.settings.light_mode_logo")}
                </p>
                <ImageEditorField
                  source="lightModeLogo"
                  width={100}
                  height={100}
                  linkPosition="bottom"
                  backgroundImageColor="#f5f5f5"
                />
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-muted-foreground">
                  {translate("crm.settings.dark_mode_logo")}
                </p>
                <ImageEditorField
                  source="darkModeLogo"
                  width={100}
                  height={100}
                  linkPosition="bottom"
                  backgroundImageColor="#1a1a1a"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Companies */}
        <Card id="companies" className="scroll-mt-20">
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">
              {translate("resources.companies.name", {
                smart_count: 2,
              })}
            </h2>
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {translate("crm.settings.companies.sectors")}
            </h3>
            <ArrayInput
              source="companySectors"
              label={false}
              helperText={false}
            >
              <SimpleFormIterator disableReordering disableClear>
                <TextInput source="label" label={false} />
              </SimpleFormIterator>
            </ArrayInput>
          </CardContent>
        </Card>

        {/* Deals */}
        <Card id="deals" className="scroll-mt-20">
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">
              {translate("resources.deals.name", {
                smart_count: 2,
              })}
            </h2>
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {translate("crm.settings.deals.currency")}
            </h3>
            <AutocompleteInput
              source="currency"
              label={false}
              choices={currencyChoices}
              inputText={(choice) => choice?.id}
              modal
            />

            <Separator />

            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {translate("crm.settings.deals.stages")}
            </h3>
            <ArrayInput
              source="dealStages"
              label={false}
              helperText={false}
              validate={validateDealStages}
            >
              <SimpleFormIterator disableClear>
                <TextInput source="label" label={false} />
              </SimpleFormIterator>
            </ArrayInput>

            <Separator />

            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {translate("crm.settings.deals.pipeline_statuses")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {translate("crm.settings.deals.pipeline_help")}
            </p>
            <div className="flex flex-wrap gap-2">
              {dealStages?.map(
                (stage: { value: string; label: string }, idx: number) => {
                  const isSelected = dealPipelineStatuses.includes(stage.value);
                  return (
                    <Button
                      key={idx}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        if (isSelected) {
                          setValue(
                            "dealPipelineStatuses",
                            dealPipelineStatuses.filter(
                              (s) => s !== stage.value,
                            ),
                          );
                        } else {
                          setValue("dealPipelineStatuses", [
                            ...dealPipelineStatuses,
                            stage.value,
                          ]);
                        }
                      }}
                    >
                      {stage.label || stage.value}
                    </Button>
                  );
                },
              )}
            </div>

            <Separator />

            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {translate("crm.settings.deals.categories")}
            </h3>
            <ArrayInput
              source="dealCategories"
              label={false}
              helperText={false}
              validate={validateDealCategories}
            >
              <SimpleFormIterator disableReordering disableClear>
                <TextInput source="label" label={false} />
              </SimpleFormIterator>
            </ArrayInput>
          </CardContent>
        </Card>

        {/* Where a quotation's events move its deal */}
        <DealQuoteStageRules />

        {/* Notes */}
        <Card id="notes" className="scroll-mt-20">
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">
              {translate("resources.notes.name", {
                smart_count: 2,
              })}
            </h2>
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {translate("crm.settings.notes.statuses")}
            </h3>
            <ArrayInput source="noteStatuses" label={false} helperText={false}>
              <SimpleFormIterator inline disableReordering disableClear>
                <TextInput source="label" label={false} className="flex-1" />
                <ColorInput source="color" />
              </SimpleFormIterator>
            </ArrayInput>
          </CardContent>
        </Card>

        {/* Tasks */}
        <Card id="tasks" className="scroll-mt-20">
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">
              {translate("resources.tasks.name", {
                smart_count: 2,
              })}
            </h2>
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {translate("crm.settings.tasks.types")}
            </h3>
            <ArrayInput source="taskTypes" label={false} helperText={false}>
              <SimpleFormIterator disableReordering disableClear>
                <TextInput source="label" label={false} />
              </SimpleFormIterator>
            </ArrayInput>
          </CardContent>
        </Card>

        {/* Products: labels, not tables (quotes §2.1). A value removed here
            stays on the products that use it; lists show it raw. */}
        <Card id="products" className="scroll-mt-20">
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">
              {translate("resources.products.name", {
                smart_count: 2,
              })}
            </h2>
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {translate("crm.settings.products.units")}
            </h3>
            <ArrayInput source="productUnits" label={false} helperText={false}>
              <SimpleFormIterator disableReordering disableClear>
                <TextInput source="label" label={false} />
              </SimpleFormIterator>
            </ArrayInput>

            <Separator />

            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {translate("crm.settings.products.categories")}
            </h3>
            <ArrayInput
              source="productCategories"
              label={false}
              helperText={false}
            >
              <SimpleFormIterator disableReordering disableClear>
                <TextInput source="label" label={false} />
              </SimpleFormIterator>
            </ArrayInput>
          </CardContent>
        </Card>
      </div>

      <SettingsSaveBar />
    </div>
  );
};
