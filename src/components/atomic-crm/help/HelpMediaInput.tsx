import { CheckCircle2, Loader2, Upload, X } from "lucide-react";
import {
  FieldTitle,
  useDataProvider,
  useInput,
  useNotify,
  useResourceContext,
  useTranslate,
} from "ra-core";
import { useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

import { FormError, FormField, FormLabel } from "@/components/admin/form";
import { InputHelperText } from "@/components/admin/input-helper-text";
import { Button } from "@/components/ui/button";

import type { CrmDataProvider } from "../providers/types";
import {
  HELP_MEDIA_ACCEPT,
  type HelpMediaKind,
  durationOf,
  helpMediaUrl,
} from "./helpMedia";

/**
 * Uploads one of a tutorial's files and stores its PATH in the form.
 *
 * The upload happens when the file is chosen, not when the form is saved: a
 * file is never overwritten, so one uploaded and then abandoned is an orphan
 * and nothing worse, while a save that had to upload 20 MB first would fail
 * late and lose the rest of the form with it. Choosing a recording also fills
 * `duration_seconds`, read off the file itself.
 */
export const HelpMediaInput = ({
  source,
  kind,
  helperText,
}: {
  source: string;
  kind: HelpMediaKind;
  helperText?: string | false;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const resource = useResourceContext();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { setValue } = useFormContext();
  const { id, field } = useInput({ source });
  const fileInput = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const path: string | null = field.value || null;

  const upload = async (file: File) => {
    setIsUploading(true);
    try {
      const [uploaded, duration] = await Promise.all([
        dataProvider.uploadHelpMedia(kind, file),
        kind === "video" ? durationOf(file) : null,
      ]);
      field.onChange(uploaded);
      if (duration != null) {
        setValue("duration_seconds", duration, { shouldDirty: true });
      }
    } catch (error) {
      const key =
        error instanceof Error && error.message.startsWith("crm.")
          ? error.message
          : "crm.help.errors.upload_failed";
      notify(key, { type: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <FormField id={id} name={field.name}>
      <FormLabel>
        <FieldTitle source={source} resource={resource} />
      </FormLabel>
      <div className="flex flex-wrap items-center gap-3">
        {path && kind === "poster" ? (
          <img
            src={helpMediaUrl(path)}
            alt=""
            className="aspect-video h-16 rounded-md border object-cover"
          />
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => fileInput.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {translate(path ? "crm.help.media.replace" : "crm.help.media.upload")}
        </Button>
        {path ? (
          <>
            <a
              href={helpMediaUrl(path)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <CheckCircle2 className="size-4 text-success" aria-hidden />
              {translate("crm.help.media.attached")}
            </a>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={translate("crm.help.media.remove")}
              onClick={() => field.onChange(null)}
            >
              <X className="size-4" />
            </Button>
          </>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept={HELP_MEDIA_ACCEPT[kind]}
          className="hidden"
          aria-label={translate(`resources.help_tutorials.fields.${source}`)}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset first, so choosing the same file again fires a change.
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      <InputHelperText helperText={helperText} />
      <FormError />
    </FormField>
  );
};
