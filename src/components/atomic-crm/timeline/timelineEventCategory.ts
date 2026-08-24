import type { TimelineEvent } from "../types";

/**
 * The four buckets the timeline filter offers (proposal §6.4).
 *
 * Grouping matters more than it looks: an unfiltered audit feed shows every
 * field-level write next to the phone call somebody logged, and becomes
 * unreadable. The default view is Communication + Collaboration + status
 * changes, with field edits and automation noise behind "show all changes" —
 * §6.4 calls showing everything by default "the classic mistake".
 */
export type TimelineCategory =
  | "communication"
  | "collaboration"
  | "changes"
  | "system";

const COMMUNICATION = new Set([
  "note.created",
  "reminder.sent",
  "reminder.failed",
  "reminder.acknowledged",
]);

const COLLABORATION = new Set([
  "comment.created",
  "comment.edited",
  "comment.deleted",
  "comment.reaction_added",
  "comment.reaction_removed",
  "mention.created",
  "task.assigned",
  "task.unassigned",
  "task.reassigned",
  "task.watcher_added",
  "task.watcher_removed",
  "task.team_assigned",
  "checklist.item_added",
  "checklist.item_completed",
  "checklist.item_reopened",
  "checklist.item_removed",
  "attachment.added",
  "attachment.removed",
]);

/**
 * Lifecycle transitions count as "changes" and are shown by default: "it was
 * blocked for three days" is the story, not noise. Pure field edits are also
 * changes but get collapsed — see `isDefaultVisible`.
 *
 * `deal.stage_changed` belongs here rather than with the field edits it
 * technically is: on a deal, the move from one stage to the next IS the story,
 * and it is the one entry that carries a reason somebody typed on purpose.
 */
const LIFECYCLE = new Set([
  "deal.stage_changed",
  "task.created",
  "task.started",
  "task.waiting",
  "task.resumed",
  "task.blocked",
  "task.unblocked",
  "task.completed",
  "task.reopened",
  "task.canceled",
  "task.archived",
  "task.deleted",
  "task.restored",
  "task.rescheduled",
]);

export const categorizeTimelineEvent = (
  event: Pick<TimelineEvent, "event_type" | "actor_kind">,
): TimelineCategory => {
  if (COMMUNICATION.has(event.event_type)) return "communication";
  if (COLLABORATION.has(event.event_type)) return "collaboration";
  // Anything an automation or the scheduler did is system, whatever it touched:
  // the useful question is "did a person do this", not "which column moved".
  if (event.actor_kind === "automation" || event.actor_kind === "import") {
    return "system";
  }
  if (LIFECYCLE.has(event.event_type)) return "changes";
  if (event.event_type.startsWith("task.")) return "changes";
  if (event.event_type.startsWith("deal.")) return "changes";
  return "system";
};

/**
 * Is this event in the default (unexpanded) view?
 *
 * Communication and collaboration always are. Lifecycle transitions are, even
 * when the system caused them — "unblocked automatically" is exactly the kind
 * of thing a user needs to see. Field-level edits and everything else system
 * are not.
 */
export const isDefaultVisible = (
  event: Pick<TimelineEvent, "event_type" | "actor_kind">,
): boolean => {
  const category = categorizeTimelineEvent(event);
  if (category === "communication" || category === "collaboration") return true;
  if (category === "system") return false;
  return LIFECYCLE.has(event.event_type);
};
