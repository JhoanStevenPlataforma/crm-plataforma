import type { DataProvider, Identifier } from "ra-core";

import type { TaskEvent } from "../../types";

/**
 * Demo-mode stand-in for `public.emit_task_event()` (proposal §5.4).
 *
 * In the real backend the event stream is written by database triggers, so no
 * write path can produce a change that is missing from the history. FakeRest
 * has no triggers, so each provider callback that emulates one calls this to
 * keep the History tab showing what the real backend would show.
 */
export type TaskEventInput = {
  taskId: Identifier;
  eventType: string;
  actor: Identifier | null;
  note?: string;
  metadata?: Record<string, unknown>;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
};

export const emitTaskEvent = async (
  dataProvider: DataProvider,
  {
    taskId,
    eventType,
    actor,
    note,
    metadata,
    oldValue,
    newValue,
  }: TaskEventInput,
) => {
  // `seq` is per task and monotonic, exactly as the SQL function computes it.
  const { data: existing } = await dataProvider.getList<TaskEvent>(
    "task_events",
    {
      filter: { task_id: taskId },
      sort: { field: "seq", order: "DESC" },
      pagination: { page: 1, perPage: 1 },
    },
  );

  await dataProvider.create<TaskEvent>("task_events", {
    data: {
      task_id: taskId,
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      actor_sales_id: actor,
      actor_kind: actor == null ? "system" : "user",
      note: note ?? null,
      metadata: metadata ?? {},
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      seq: (existing[0]?.seq ?? 0) + 1,
    } as TaskEvent,
  });
};
