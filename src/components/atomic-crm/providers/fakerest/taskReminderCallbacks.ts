import type { DataProvider, Identifier, ResourceCallbacks } from "ra-core";

import type { Task, TaskReminder } from "../../types";
import { computeNextFireAt } from "../../tasks/taskReminderSchedule";
import { emitTaskEvent } from "./taskEventEmitter";

/**
 * Demo-mode counterpart of the `task_reminders` triggers (proposal §9).
 *
 * Reproduces the two behaviours a user can observe: the materialized
 * `next_fire_at` (so the list shows when a rule will fire, not a blank) and the
 * `reminder.created` / `reminder.canceled` events, so the History tab tells the
 * same story it would against the real backend.
 *
 * Deliberately NOT reproduced: `dispatch_due_reminders()`. A demo tab is reset
 * on reload and has no scheduler, so firing reminders would mean inventing
 * deliveries that never happened — the opposite of what this module is for. The
 * outbox stays empty in demo mode.
 */

const dueDateOf = async (
  dataProvider: DataProvider,
  taskId: Identifier,
): Promise<string | null> => {
  try {
    const { data: task } = await dataProvider.getOne<Task>("tasks", {
      id: taskId,
    });
    return task.due_date ?? null;
  } catch {
    // A rule created against a task that is already gone simply has no
    // schedule; the real database would refuse the row on its FK.
    return null;
  }
};

const auditMetadata = (reminder: TaskReminder) => ({
  reminder_id: reminder.id,
  schedule_kind: reminder.schedule_kind,
  channels: reminder.channels,
  recipients: reminder.recipients,
  next_fire_at: reminder.next_fire_at ?? null,
});

export const taskReminderCallbacks = (
  getIdentity: () => Promise<{ id: Identifier } | undefined>,
): ResourceCallbacks<TaskReminder> => ({
  resource: "task_reminders",

  beforeCreate: async (params, dataProvider) => {
    const currentUser = await getIdentity();
    // `params.data` is a partial record until the row is created; the schedule
    // fields the form always sends are what these two helpers read.
    const submitted = params.data as TaskReminder;
    const dueDate = await dueDateOf(dataProvider, submitted.task_id);
    const nextFireAt = computeNextFireAt(submitted, dueDate);

    return {
      ...params,
      data: {
        ...params.data,
        created_by: currentUser?.id ?? params.data.created_by,
        created_at: new Date().toISOString(),
        timezone: params.data.timezone ?? "UTC",
        recipients: params.data.recipients ?? "owner",
        stop_on_complete: params.data.stop_on_complete ?? true,
        fired_count: 0,
        next_fire_at: nextFireAt,
        // A rule with nowhere to fire is inactive from the start, exactly as
        // the `task_reminders_before_write` trigger decides.
        is_active: nextFireAt != null,
      },
    };
  },

  afterCreate: async (result, dataProvider) => {
    await emitTaskEvent(dataProvider, {
      taskId: result.data.task_id,
      eventType: "reminder.created",
      actor: result.data.created_by,
      metadata: auditMetadata(result.data),
    });
    return result;
  },

  beforeUpdate: async (params, dataProvider) => {
    // Deactivating never recomputes: the rule is being switched off, and
    // recomputing would hand it a fresh fire time on the way out.
    if (params.data.is_active === false) {
      return {
        ...params,
        data: { ...params.data, next_fire_at: null },
      };
    }

    const taskId = params.data.task_id ?? params.previousData?.task_id;
    if (taskId == null) return params;

    const dueDate = await dueDateOf(dataProvider, taskId);
    const merged = { ...params.previousData, ...params.data } as TaskReminder;

    return {
      ...params,
      data: {
        ...params.data,
        next_fire_at: computeNextFireAt(
          merged,
          dueDate,
          new Date(),
          merged.fired_count ?? 0,
        ),
      },
    };
  },

  afterUpdate: async (result, dataProvider) => {
    // Cancelling is a deactivation, not a delete — which is precisely why it
    // is worth an event.
    if (result.data.is_active) return result;

    const currentUser = await getIdentity();
    await emitTaskEvent(dataProvider, {
      taskId: result.data.task_id,
      eventType: "reminder.canceled",
      actor: currentUser?.id ?? null,
      metadata: auditMetadata(result.data),
    });
    return result;
  },
});
