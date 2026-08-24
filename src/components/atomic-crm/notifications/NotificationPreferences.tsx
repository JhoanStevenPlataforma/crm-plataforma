import {
  useCreate,
  useGetIdentity,
  useGetList,
  useNotify,
  useRefresh,
  useTranslate,
  useUpdate,
} from "ra-core";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { NotificationPreference, ReminderChannel } from "../types";

/**
 * Anti-fatigue settings (proposal §9.5).
 *
 * "A reminder system without throttling is uninstalled within a week." These
 * five controls are the difference between a useful nudge and the thing
 * everybody muted in week two — and every one of them is enforced in the
 * database (`dispatch_due_reminders`, `claim_task_notifications`), not here.
 *
 * In-app is not offered as a mutable channel by accident: it is the one
 * delivery that never interrupts anybody, so quiet hours and the digest skip
 * it. It IS offered as a mute, because opting out has to mean opting out.
 */

/** The channels a user can silence. Matches `public.reminder_channel`. */
const MUTABLE_CHANNELS: ReminderChannel[] = [
  "in_app",
  "email",
  "push",
  "whatsapp",
  "sms",
];

type PreferenceForm = Omit<
  NotificationPreference,
  "id" | "sales_id" | "created_at" | "updated_at"
>;

/**
 * Mirrors the column defaults of `public.notification_preferences`. The
 * database synthesizes the same values for a user with no row, so this is only
 * what the form shows before the first save.
 */
const DEFAULTS: PreferenceForm = {
  timezone: "UTC",
  quiet_hours_start: null,
  quiet_hours_end: null,
  digest_mode: false,
  digest_at: "08:00",
  muted_channels: [],
  max_per_hour: 20,
  dedupe_window_minutes: 60,
};

/** `time` comes back from Postgres as `HH:MM:SS`; `<input type="time">` wants `HH:MM`. */
const toTimeInput = (value?: string | null) => (value ? value.slice(0, 5) : "");
const fromTimeInput = (value: string) => (value === "" ? null : value);

export const NotificationPreferences = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const { identity } = useGetIdentity();

  const { data, isPending } = useGetList<NotificationPreference>(
    "notification_preferences",
    {
      filter: { sales_id: identity?.id },
      pagination: { page: 1, perPage: 1 },
      sort: { field: "id", order: "ASC" },
    },
    { enabled: identity?.id != null },
  );

  const existing = data?.[0];
  const [form, setForm] = useState<PreferenceForm>({
    ...DEFAULTS,
    // A user who never opened this screen gets their browser's zone rather
    // than UTC — the setting only means something in local time.
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULTS.timezone,
  });

  useEffect(() => {
    if (!existing) return;
    setForm({
      timezone: existing.timezone,
      quiet_hours_start: existing.quiet_hours_start ?? null,
      quiet_hours_end: existing.quiet_hours_end ?? null,
      digest_mode: existing.digest_mode,
      digest_at: existing.digest_at,
      muted_channels: existing.muted_channels ?? [],
      max_per_hour: existing.max_per_hour,
      dedupe_window_minutes: existing.dedupe_window_minutes,
    });
  }, [existing]);

  const [create, { isPending: isCreating }] = useCreate();
  const [update, { isPending: isUpdating }] = useUpdate();
  const isSaving = isCreating || isUpdating;

  if (!identity || isPending) return null;

  const onSuccess = () => {
    notify("crm.notifications.preferences.saved", { type: "info" });
    refresh();
  };
  const onError = () =>
    notify("crm.notifications.preferences.error", { type: "error" });

  const save = () => {
    const payload = { ...form, sales_id: identity.id };
    if (existing) {
      update(
        "notification_preferences",
        { id: existing.id, data: payload, previousData: existing },
        { onSuccess, onError },
      );
      return;
    }
    create(
      "notification_preferences",
      { data: payload },
      { onSuccess, onError },
    );
  };

  const toggleChannel = (channel: ReminderChannel, muted: boolean) =>
    setForm((current) => ({
      ...current,
      muted_channels: muted
        ? [...current.muted_channels, channel]
        : current.muted_channels.filter((entry) => entry !== channel),
    }));

  return (
    <Card>
      <CardContent className="space-y-4">
        <h2 className="text-xl font-semibold text-muted-foreground">
          {translate("crm.notifications.preferences.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {translate("crm.notifications.preferences.hint")}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="np-timezone">
              {translate("crm.notifications.preferences.timezone")}
            </Label>
            <Input
              id="np-timezone"
              value={form.timezone}
              onChange={(event) =>
                setForm({ ...form, timezone: event.target.value })
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="np-cap">
              {translate("crm.notifications.preferences.max_per_hour")}
            </Label>
            <Input
              id="np-cap"
              type="number"
              min={1}
              value={form.max_per_hour}
              onChange={(event) =>
                setForm({
                  ...form,
                  max_per_hour: Math.max(1, Number(event.target.value) || 1),
                })
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="np-quiet-start">
              {translate("crm.notifications.preferences.quiet_start")}
            </Label>
            <Input
              id="np-quiet-start"
              type="time"
              value={toTimeInput(form.quiet_hours_start)}
              onChange={(event) =>
                setForm({
                  ...form,
                  quiet_hours_start: fromTimeInput(event.target.value),
                })
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="np-quiet-end">
              {translate("crm.notifications.preferences.quiet_end")}
            </Label>
            <Input
              id="np-quiet-end"
              type="time"
              value={toTimeInput(form.quiet_hours_end)}
              onChange={(event) =>
                setForm({
                  ...form,
                  quiet_hours_end: fromTimeInput(event.target.value),
                })
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="np-digest"
              checked={form.digest_mode}
              onCheckedChange={(checked) =>
                setForm({ ...form, digest_mode: checked })
              }
            />
            <Label htmlFor="np-digest">
              {translate("crm.notifications.preferences.digest")}
            </Label>
          </div>

          {form.digest_mode && (
            <div className="flex items-center gap-2">
              <Label htmlFor="np-digest-at">
                {translate("crm.notifications.preferences.digest_at")}
              </Label>
              <Input
                id="np-digest-at"
                type="time"
                className="w-32"
                value={toTimeInput(form.digest_at)}
                onChange={(event) =>
                  setForm({
                    ...form,
                    digest_at: event.target.value || DEFAULTS.digest_at,
                  })
                }
              />
            </div>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            {translate("crm.notifications.preferences.muted")}
          </legend>
          <div className="flex flex-wrap gap-4">
            {MUTABLE_CHANNELS.map((channel) => (
              <div key={channel} className="flex items-center space-x-2">
                <Checkbox
                  id={`np-mute-${channel}`}
                  checked={form.muted_channels.includes(channel)}
                  onCheckedChange={(checked) =>
                    toggleChannel(channel, checked === true)
                  }
                />
                <Label htmlFor={`np-mute-${channel}`}>
                  {translate(`crm.notifications.channels.${channel}`)}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={isSaving}>
            {translate("ra.action.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
