import { FileText, Film, Send } from "lucide-react";
import { minValue, required, useTranslate } from "ra-core";

import { BooleanInput } from "@/components/admin/boolean-input";
import { NumberInput } from "@/components/admin/number-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

import { FormSection } from "../misc/FormSection";
import { formatSteps, parseSteps, validateSlug } from "./helpForm";
import { HelpMediaInput } from "./HelpMediaInput";

/**
 * A tutorial (docs/proposals/help-center.md). Labels resolve from
 * `resources.help_tutorials.fields.*` by source name.
 *
 * Publishing with no recording attached is refused by the database
 * (`help_tutorials_published_has_video`); the save reports it.
 */
export const HelpTutorialInputs = () => {
  const translate = useTranslate();

  return (
    <div className="flex w-full flex-col gap-10">
      <FormSection
        icon={FileText}
        title={translate("resources.help_tutorials.field_categories.content")}
        description={translate("crm.form_section.help_content")}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
          <TextInput
            source="title"
            validate={required()}
            className="sm:flex-1"
            helperText={false}
          />
          <ReferenceInput
            source="category_id"
            reference="help_categories"
            sort={{ field: "rank", order: "ASC" }}
          >
            <SelectInput
              optionText="title"
              label="resources.help_tutorials.fields.category_id"
              validate={required()}
              className="sm:w-64"
              helperText={false}
            />
          </ReferenceInput>
        </div>
        <TextInput
          source="slug"
          validate={[required(), validateSlug]}
          helperText="resources.help_tutorials.helpers.slug"
        />
        <TextInput source="description" multiline rows={2} helperText={false} />
        <TextInput
          source="steps"
          multiline
          rows={6}
          format={formatSteps}
          parse={parseSteps}
          helperText="resources.help_tutorials.helpers.steps"
        />
      </FormSection>

      <FormSection
        icon={Film}
        title={translate("resources.help_tutorials.field_categories.media")}
        description={translate("crm.form_section.help_media")}
      >
        <HelpMediaInput
          source="video_path"
          kind="video"
          helperText="resources.help_tutorials.helpers.video_path"
        />
        <HelpMediaInput
          source="poster_path"
          kind="poster"
          helperText="resources.help_tutorials.helpers.poster_path"
        />
        <HelpMediaInput
          source="captions_path"
          kind="captions"
          helperText="resources.help_tutorials.helpers.captions_path"
        />
        <NumberInput
          source="duration_seconds"
          min={0}
          validate={minValue(0)}
          className="sm:w-48"
          helperText="resources.help_tutorials.helpers.duration_seconds"
        />
      </FormSection>

      <FormSection
        icon={Send}
        title={translate(
          "resources.help_tutorials.field_categories.publishing",
        )}
        description={translate("crm.form_section.help_publishing")}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          <NumberInput
            source="rank"
            defaultValue={0}
            className="sm:w-32"
            helperText={false}
          />
          <BooleanInput
            source="is_published"
            defaultValue={false}
            helperText="resources.help_tutorials.helpers.is_published"
          />
        </div>
      </FormSection>
    </div>
  );
};
