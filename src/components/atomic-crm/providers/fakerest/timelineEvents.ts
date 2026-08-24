import type { DataProvider, Identifier } from "ra-core";

import type {
  ContactNote,
  DealNote,
  DealStageChange,
  Task,
  TaskEntityType,
  TaskEvent,
  TimelineEvent,
} from "../../types";

/**
 * Demo-mode emulation of the `public.timeline_events` view (proposal §6.2).
 *
 * The real view is a `UNION ALL` over the task event stream and the note
 * tables, filtered by each branch's own RLS. FakeRest has no views, so the
 * union is assembled here — the same pattern the repo already uses for
 * `activity_log`.
 *
 * The one structural difference: there is no `task_links` table in demo mode
 * (the primary link lives on the task row, see `linkTaskToEntity`), so a task
 * event resolves its entity through the task rather than through a lateral
 * join. The resulting rows are shape-identical, which is what the frontend
 * cares about.
 */

const PER_PAGE = 500;

const listAll = async <T>(
  dataProvider: DataProvider,
  resource: string,
): Promise<T[]> => {
  const { data } = await dataProvider.getList<any>(resource, {
    filter: {},
    sort: { field: "id", order: "ASC" },
    pagination: { page: 1, perPage: PER_PAGE },
  });
  return data as T[];
};

export const getTimelineEvents = async (
  dataProvider: DataProvider,
  entityType?: TaskEntityType,
  entityId?: Identifier,
): Promise<TimelineEvent[]> => {
  const [events, tasks, contactNotes, dealNotes, stageChanges] =
    await Promise.all([
      listAll<TaskEvent>(dataProvider, "task_events"),
      listAll<Task>(dataProvider, "tasks"),
      listAll<ContactNote>(dataProvider, "contact_notes"),
      listAll<DealNote>(dataProvider, "deal_notes"),
      listAll<DealStageChange>(dataProvider, "deal_stage_changes"),
    ]);

  const taskById = new Map(tasks.map((task) => [String(task.id), task]));

  const fromTasks: TimelineEvent[] = events.map((event) => {
    const task = taskById.get(String(event.task_id));
    return {
      id: `task_event:${event.id}`,
      occurred_at: event.occurred_at,
      event_type: event.event_type,
      source: "task",
      task_id: event.task_id,
      actor_sales_id: event.actor_sales_id ?? null,
      actor_kind: event.actor_kind,
      entity_type: task?.primary_entity_type ?? null,
      entity_id: task?.primary_entity_id ?? null,
      payload: {
        field: event.field ?? null,
        old: event.old_value ?? null,
        new: event.new_value ?? null,
        meta: event.metadata ?? {},
        note: event.note ?? null,
      },
    };
  });

  const fromContactNotes: TimelineEvent[] = contactNotes.map((note) => ({
    id: `contact_note:${note.id}`,
    occurred_at: note.date,
    event_type: "note.created",
    source: "contact_note",
    task_id: null,
    actor_sales_id: note.sales_id ?? null,
    actor_kind: "user",
    entity_type: "contact",
    entity_id: note.contact_id,
    payload: {
      text: note.text,
      status: note.status,
      contact_id: note.contact_id,
    },
  }));

  const fromDealNotes: TimelineEvent[] = dealNotes.map((note) => ({
    id: `deal_note:${note.id}`,
    occurred_at: note.date,
    event_type: "note.created",
    source: "deal_note",
    task_id: null,
    actor_sales_id: note.sales_id ?? null,
    actor_kind: "user",
    entity_type: "deal",
    entity_id: note.deal_id,
    payload: { text: note.text, deal_id: note.deal_id },
  }));

  // Stage transitions carry their justification in the payload, exactly as the
  // view's `deal_stage_changes` branch does, so the timeline renders the same
  // way against either provider.
  const fromStageChanges: TimelineEvent[] = stageChanges.map((change) => ({
    id: `deal_stage_change:${change.id}`,
    occurred_at: change.changed_at,
    event_type: "deal.stage_changed",
    source: "deal_stage_change",
    task_id: null,
    actor_sales_id: change.sales_id ?? null,
    actor_kind: "user",
    entity_type: "deal",
    entity_id: change.deal_id,
    payload: {
      from_stage: change.from_stage ?? null,
      to_stage: change.to_stage,
      reason: change.reason ?? null,
      deal_id: change.deal_id,
      attachments: change.attachments ?? null,
    },
  }));

  const all = [
    ...fromTasks,
    ...fromContactNotes,
    ...fromDealNotes,
    ...fromStageChanges,
  ];

  const filtered =
    entityType == null && entityId == null
      ? all
      : all.filter(
          (event) =>
            (entityType == null || event.entity_type === entityType) &&
            (entityId == null || String(event.entity_id) === String(entityId)),
        );

  return filtered.sort(
    (a, b) =>
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
};
