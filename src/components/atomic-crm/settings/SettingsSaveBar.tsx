import { RotateCcw, Save } from "lucide-react";
import { useNotify, useTranslate } from "ra-core";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { Confirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";

import { defaultConfiguration } from "../root/defaultConfiguration";

/**
 * The sticky footer of the settings page: reset, cancel, save.
 *
 * "Reset to defaults" wipes every stage, category and colour the organisation
 * configured, so it asks first; and it only changes the FORM, so it says that
 * nothing is stored until Save. The reset keeps the stored configuration as the
 * form's baseline (`keepDefaultValues`), which is what keeps the page "dirty"
 * and the "Unsaved changes" marker visible until the user saves or leaves.
 */
export const SettingsSaveBar = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const [isConfirming, setIsConfirming] = useState(false);
  const {
    reset,
    formState: { isSubmitting, isDirty },
  } = useFormContext();

  const resetToDefaults = () => {
    reset(
      {
        ...defaultConfiguration,
        lightModeLogo: { src: defaultConfiguration.lightModeLogo },
        darkModeLogo: { src: defaultConfiguration.darkModeLogo },
      },
      { keepDefaultValues: true },
    );
    setIsConfirming(false);
    notify("crm.settings.reset_defaults_pending", { type: "info" });
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4">
      <div className="max-w-screen-xl mx-auto flex gap-8 px-4">
        <div className="hidden md:block w-48 shrink-0" />
        <div className="flex-1 min-w-0 max-w-2xl flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsConfirming(true)}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            {translate("crm.settings.reset_defaults")}
          </Button>
          <div className="flex items-center gap-2">
            {isDirty ? (
              <span role="status" className="text-sm text-muted-foreground">
                {translate("crm.form_page.unsaved_changes")}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => window.history.back()}
            >
              {translate("ra.action.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="h-4 w-4 mr-1" />
              {isSubmitting
                ? translate("crm.settings.saving")
                : translate("ra.action.save")}
            </Button>
          </div>
        </div>
      </div>
      <Confirm
        isOpen={isConfirming}
        title="crm.settings.reset_defaults_title"
        content="crm.settings.reset_defaults_content"
        confirm="crm.settings.reset_defaults"
        confirmColor="warning"
        onClose={() => setIsConfirming(false)}
        onConfirm={resetToDefaults}
      />
    </div>
  );
};
