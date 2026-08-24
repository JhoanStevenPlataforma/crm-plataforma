import { BellOff } from "lucide-react";
import {
  useCreate,
  useGetList,
  useNotify,
  useRefresh,
  useTranslate,
  useUpdate,
  type Identifier,
} from "ra-core";
import { useState } from "react";

import { DateField } from "@/components/admin/date-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ReminderChannel, TaskReminder } from "../types";
import {
  buildReminderPayload,
  matchReminderPreset,
  REMINDER_PRESETS,
} from "./taskReminderPresets";

/** The channels a user can pick in the UI. The rest need provider setup (§9.4). */
const OFFERED_CHANNELS: readonly ReminderChannel[] = ["in_app", "email"];

/**
 * Reminder rules on a task (proposal §9).
 *
 * The component writes RULES only. When a rule fires is the database's job:
 * `next_fire_at` is materialized by a trigger and advanced by
 * `dispatch_due_reminders()`, so nothing here computes a schedule — a client
 * that did would drift from the scheduler the moment a due date moved.
 *
 * Cancelling deactivates (`is_active = false`) rather than deleting, which is
 * what puts "X turned the chase off" in the timeline instead of silently
 * losing the rule.
 */
export const TaskReminders = ({ taskId }: { taskId: Identifier }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();

  const [preset, setPreset] = useState<string>("");
  const [absoluteAt, setAbsoluteAt] = useState<string>("");
  const [channels, setChannels] = useState<ReminderChannel[]>(["in_app"]);

  const { data: reminders } = useGetList<TaskReminder>("task_reminders", {
    filter: { task_id: taskId, is_active: true },
    sort: { field: "next_fire_at", order: "ASC" },
    pagination: { page: 1, perPage: 50 },
  });

  const [create, { isPending: isCreating }] = useCreate();
  const [update, { isPending: isUpdating }] = useUpdate();
  const isMutating = isCreating || isUpdating;

  const onError = () =>
    notify("resources.tasks.reminders.error", { type: "error" });

  const needsDate =
    REMINDER_PRESETS.find((entry) => entry.key === preset)?.needsDate === true;

  const addReminder = () => {
    if (isMutating) return;

    const payload = buildReminderPayload({
      taskId,
      presetKey: preset,
      channels,
      absoluteAt: absoluteAt ? new Date(absoluteAt).toISOString() : null,
    });

    // The build refuses anything the check constraints would reject anyway;
    // failing here gives a message instead of an opaque 400.
    if (!payload) {
      notify("resources.tasks.reminders.incomplete", { type: "warning" });
      return;
    }

    create(
      "task_reminders",
      { data: payload },
      {
        onSuccess: () => {
          setPreset("");
          setAbsoluteAt("");
          refresh();
        },
        onError,
      },
    );
  };

  const cancelReminder = (reminder: TaskReminder) =>
    update(
      "task_reminders",
      {
        id: reminder.id,
        data: { is_active: false },
        previousData: reminder,
      },
      { onSuccess: () => refresh(), onError },
    );

  const toggleChannel = (channel: ReminderChannel, checked: boolean) =>
    setChannels((current) =>
      checked
        ? [...current, channel]
        : current.filter((entry) => entry !== channel),
    );

  const describe = (reminder: TaskReminder) => {
    const matched = matchReminderPreset(reminder);
    if (matched) {
      return translate(`resources.tasks.reminders.presets.${matched.key}`);
    }
    // A rule an automation or the API wrote in a shape no preset covers still
    // has to render as something truthful.
    return translate(
      `resources.tasks.reminders.kinds.${reminder.schedule_kind}`,
      { _: reminder.schedule_kind },
    );
  };

  const active = reminders ?? [];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1">
        <h4 className="text-xs font-medium text-muted-foreground">
          {translate("resources.tasks.reminders.title")}
          {active.length > 0 && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              {active.length}
            </Badge>
          )}
        </h4>

        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate("resources.tasks.reminders.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {active.map((reminder) => (
              <li key={reminder.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">
                  {describe(reminder)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {reminder.channels
                      .map((channel) =>
                        translate(
                          `resources.tasks.reminders.channels.${channel}`,
                          { _: channel },
                        ),
                      )
                      .join(", ")}
                  </span>
                </span>

                {reminder.next_fire_at && (
                  <DateField
                    source="next_fire_at"
                    record={reminder}
                    showDate
                    showTime
                    className="text-xs text-muted-foreground"
                  />
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  aria-label={translate("resources.tasks.reminders.cancel", {
                    label: describe(reminder),
                  })}
                  onClick={() => cancelReminder(reminder)}
                  disabled={isMutating}
                >
                  <BellOff className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger
              className="flex-1"
              aria-label={translate("resources.tasks.reminders.add")}
            >
              <SelectValue
                placeholder={translate("resources.tasks.reminders.add")}
              />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_PRESETS.map((entry) => (
                <SelectItem key={entry.key} value={entry.key}>
                  {translate(`resources.tasks.reminders.presets.${entry.key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            size="sm"
            onClick={addReminder}
            disabled={!preset || isMutating}
          >
            {translate("resources.tasks.reminders.add_action")}
          </Button>
        </div>

        {needsDate && (
          <Input
            type="datetime-local"
            value={absoluteAt}
            onChange={(event) => setAbsoluteAt(event.target.value)}
            aria-label={translate("resources.tasks.reminders.date")}
          />
        )}

        <div className="flex items-center gap-4">
          {OFFERED_CHANNELS.map((channel) => (
            <label
              key={channel}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Checkbox
                checked={channels.includes(channel)}
                onCheckedChange={(checked) =>
                  toggleChannel(channel, checked === true)
                }
                aria-label={translate(
                  `resources.tasks.reminders.channels.${channel}`,
                )}
              />
              {translate(`resources.tasks.reminders.channels.${channel}`)}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
