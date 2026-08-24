import { datatype, lorem, random } from "faker/locale/en_US";

import { defaultTaskTypes } from "../../../root/defaultConfiguration";
import type { Task, TaskPriorityKey } from "../../../types";
import type { Db } from "./types";
import { priorityByKey, statusByKey } from "./taskCatalogues";
import { randomDate } from "./utils";

export const type: string[] = [
  "email",
  "email",
  "email",
  "email",
  "email",
  "email",
  "call",
  "call",
  "call",
  "call",
  "call",
  "call",
  "call",
  "call",
  "call",
  "call",
  "call",
  "demo",
  "lunch",
  "meeting",
  "follow-up",
  "follow-up",
  "thank-you",
  "ship",
  "none",
];

/**
 * Most tasks sit at `normal`; the deck is weighted so the demo shows the
 * priority badges without making every row shout.
 */
const PRIORITY_DECK: TaskPriorityKey[] = [
  "normal",
  "normal",
  "normal",
  "normal",
  "normal",
  "normal",
  "low",
  "high",
  "high",
  "urgent",
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How a demo task ended up.
 *
 * Every generated task used to be `pending` with `completed_at: null` and a due
 * date in the future, which meant demo mode could not show a single completed
 * or overdue task. The team dashboards report exactly those two things, so the
 * whole workload half of them rendered as zero — a demo that undersells the
 * feature and, worse, hides any bug in it.
 */
type TaskOutcome = "completed" | "overdue" | "pending";

const OUTCOME_DECK: TaskOutcome[] = [
  "completed",
  "completed",
  "completed",
  "completed",
  "completed",
  "overdue",
  "overdue",
  "pending",
  "pending",
  "pending",
];

/**
 * Due date and completion for one outcome.
 *
 * Roughly three in ten completed tasks land late, so the on-time rate on the
 * dashboard is a number worth looking at rather than a flat 100%.
 */
const scheduleFor = (outcome: TaskOutcome, createdAt: Date) => {
  const now = Date.now();

  if (outcome === "pending") {
    return {
      dueDate: randomDate(new Date(now), new Date(now + 100 * DAY_MS)),
      completedAt: null,
    };
  }

  // Both remaining outcomes are due in the past; only one of them was done.
  const dueDate = randomDate(createdAt, new Date(now));
  if (outcome === "overdue") {
    return { dueDate, completedAt: null };
  }

  const wasOnTime = datatype.number({ min: 0, max: 9 }) < 7;
  const drift = datatype.number({ min: 0, max: wasOnTime ? 3 : 7 }) * DAY_MS;
  const completedTs = wasOnTime
    ? Math.max(createdAt.getTime(), dueDate.getTime() - drift)
    : Math.min(now, dueDate.getTime() + drift + DAY_MS);

  return { dueDate, completedAt: new Date(completedTs) };
};

/**
 * Demo tasks follow the shape `tasks_summary` returns, including the
 * denormalized catalogue keys and the traceability counters — otherwise demo
 * mode would render a different product from the real one.
 *
 * A slice of them carries a non-zero `reschedule_count` on purpose: the
 * "rescheduled xN" badge is one of the headline features (§16), and a demo
 * where it never appears undersells it.
 */
export const generateTasks = (db: Db) => {
  return Array.from(Array(400).keys()).map<Task>((id) => {
    const contact = random.arrayElement(db.contacts);
    contact.nb_tasks = (contact.nb_tasks ?? 0) + 1;

    const taskType = random.arrayElement(defaultTaskTypes).value;
    const priority = priorityByKey(random.arrayElement(PRIORITY_DECK));
    const outcome = random.arrayElement(OUTCOME_DECK);
    const createdAtDate = randomDate(new Date(contact.first_seen));
    const createdAt = createdAtDate.toISOString();
    const { dueDate, completedAt } = scheduleFor(outcome, createdAtDate);
    const status = statusByKey(
      outcome === "completed" ? "completed" : "pending",
    );
    const isDone = completedAt != null;
    const text = lorem.sentence();

    return {
      id,
      // new model
      title: text,
      description: datatype.boolean() ? lorem.paragraph() : null,
      status_id: status.id,
      priority_id: priority.id,
      status_key: isDone ? "completed" : "pending",
      status_label: status.label,
      status_is_open: !isDone,
      status_is_terminal: isDone,
      counts_as_done: isDone,
      priority_key: priority.key as TaskPriorityKey,
      priority_label: priority.label,
      priority_rank: priority.rank,
      type_key: taskType,
      type_label: taskType,
      due_date: dueDate.toISOString(),
      completed_at: completedAt?.toISOString() ?? null,
      // The database CHECK ties these two together, so the demo honours it.
      completed_by: isDone ? contact.sales_id : null,
      canceled_at: null,
      deleted_at: null,
      owner_sales_id: contact.sales_id,
      created_by: contact.sales_id,
      created_at: createdAt,
      updated_at: createdAt,
      reschedule_count:
        datatype.number({ min: 0, max: 9 }) > 7
          ? datatype.number({ min: 1, max: 4 })
          : 0,
      reassign_count: 0,
      comment_count: 0,
      attachment_count: 0,
      checklist_total: 0,
      checklist_done: 0,
      blocked_seconds: 0,
      source: "manual",
      primary_entity_type: "contact",
      primary_entity_id: contact.id,
      primary_entity_label: `${contact.first_name} ${contact.last_name}`,
      is_overdue: outcome === "overdue",
      // legacy shims, kept in sync exactly as the database does
      contact_id: contact.id,
      type: taskType,
      text,
      done_date: completedAt?.toISOString(),
      sales_id: contact.sales_id,
    };
  });
};
