import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate, useUpdate } from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { emailErrorMessage } from "../providers/commons/emailRpc";
import type { EmailSettings } from "../types";

type Draft = Pick<
  EmailSettings,
  | "provider_key"
  | "is_enabled"
  | "from_email"
  | "from_name"
  | "reply_to_mode"
  | "transactional_stream"
  | "commercial_stream"
  | "max_per_user_hour"
  | "max_per_recipient_day"
>;

const draftOf = (settings: EmailSettings): Draft => ({
  provider_key: settings.provider_key,
  is_enabled: settings.is_enabled,
  from_email: settings.from_email ?? "",
  from_name: settings.from_name ?? "",
  reply_to_mode: settings.reply_to_mode,
  transactional_stream: settings.transactional_stream,
  commercial_stream: settings.commercial_stream,
  max_per_user_hour: settings.max_per_user_hour,
  max_per_recipient_day: settings.max_per_recipient_day,
});

/**
 * The provider and the sender. Only the columns edited here are posted: the
 * secret references are the server's, and a row posted whole would be refused
 * (`email_settings_column_protected`).
 */
export const EmailProviderForm = ({
  settings,
}: {
  settings: EmailSettings;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(settings));
  const [update, { isPending }] = useUpdate<EmailSettings>();

  useEffect(() => setDraft(draftOf(settings)), [settings]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = () =>
    update(
      "email_settings",
      {
        id: settings.id,
        data: {
          ...draft,
          from_email: draft.from_email?.trim() || null,
          from_name: draft.from_name?.trim() || null,
        },
        previousData: settings,
      },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          notify("crm.email.settings.saved");
          queryClient.invalidateQueries({ queryKey: ["email", "status"] });
        },
        onError: (error) => notify(emailErrorMessage(error), { type: "error" }),
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate("crm.email.settings.provider_title")}</CardTitle>
        <CardDescription>
          {translate("crm.email.settings.provider_help")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="email-enabled">
            {translate("crm.email.settings.enabled")}
          </Label>
          <Switch
            id="email-enabled"
            checked={draft.is_enabled}
            onCheckedChange={(checked) => set("is_enabled", checked)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email-provider">
            {translate("crm.email.settings.provider")}
          </Label>
          <Select
            value={draft.provider_key}
            onValueChange={(value) =>
              set("provider_key", value as Draft["provider_key"])
            }
          >
            <SelectTrigger id="email-provider" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">
                {translate("crm.email.settings.providers.mock")}
              </SelectItem>
              <SelectItem value="postmark">
                {translate("crm.email.settings.providers.postmark")}
              </SelectItem>
              <SelectItem value="resend">
                {translate("crm.email.settings.providers.resend")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email-from">
              {translate("crm.email.settings.from_email")}
            </Label>
            <Input
              id="email-from"
              type="email"
              autoComplete="off"
              value={draft.from_email ?? ""}
              onChange={(event) => set("from_email", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email-from-name">
              {translate("crm.email.settings.from_name")}
            </Label>
            <Input
              id="email-from-name"
              maxLength={120}
              value={draft.from_name ?? ""}
              onChange={(event) => set("from_name", event.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {translate("crm.email.settings.from_help")}
        </p>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email-reply-to">
            {translate("crm.email.settings.reply_to")}
          </Label>
          <Select
            value={draft.reply_to_mode}
            onValueChange={(value) =>
              set("reply_to_mode", value as Draft["reply_to_mode"])
            }
          >
            <SelectTrigger id="email-reply-to" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sender">
                {translate("crm.email.settings.reply_to_modes.sender")}
              </SelectItem>
              <SelectItem value="none">
                {translate("crm.email.settings.reply_to_modes.none")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Streams are Postmark's: no other provider reads them. */}
          {draft.provider_key === "postmark" ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email-stream-transactional">
                  {translate("crm.email.settings.transactional_stream")}
                </Label>
                <Input
                  id="email-stream-transactional"
                  value={draft.transactional_stream}
                  onChange={(event) =>
                    set("transactional_stream", event.target.value)
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email-stream-commercial">
                  {translate("crm.email.settings.commercial_stream")}
                </Label>
                <Input
                  id="email-stream-commercial"
                  value={draft.commercial_stream}
                  onChange={(event) =>
                    set("commercial_stream", event.target.value)
                  }
                />
              </div>
            </>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email-limit-user">
              {translate("crm.email.settings.max_per_user_hour")}
            </Label>
            <Input
              id="email-limit-user"
              type="number"
              min={1}
              max={1000}
              value={draft.max_per_user_hour}
              onChange={(event) =>
                set("max_per_user_hour", Number(event.target.value))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email-limit-recipient">
              {translate("crm.email.settings.max_per_recipient_day")}
            </Label>
            <Input
              id="email-limit-recipient"
              type="number"
              min={1}
              max={100}
              value={draft.max_per_recipient_day}
              onChange={(event) =>
                set("max_per_recipient_day", Number(event.target.value))
              }
            />
          </div>
        </div>

        <div>
          <Button disabled={isPending} onClick={save}>
            {translate("ra.action.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
