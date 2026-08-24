import type { TaskPriorityKey, TaskStatusKey } from "../types";

/**
 * Presentation rules for the task lifecycle (proposal §16).
 *
 * Two deliberate choices, both about noise:
 *
 *  - Priority is rendered only when it is NOT `normal`. Every task has a
 *    priority (the column is NOT NULL, default `normal`), so a "Normal" chip on
 *    every row would carry no information while competing for attention with
 *    the badges that do.
 *  - Status is rendered only when it is not `pending` and not `completed`.
 *    `pending` is the default and `completed` is already unmistakable from the
 *    checkbox; the states worth a chip are the ones a manager needs to see
 *    without opening the task — in progress, waiting, blocked, cancelled.
 *
 * Colour is never the only signal: each priority also carries an icon name and
 * a label, per WCAG 1.4.1.
 */

export type PriorityDisplay = {
  /** Tailwind classes for the badge. */
  className: string;
  /** lucide-react icon name rendered next to the label. */
  icon: "chevron-down" | "chevron-up" | "alert-triangle";
};

export const PRIORITY_DISPLAY: Record<
  Exclude<TaskPriorityKey, "normal">,
  PriorityDisplay
> = {
  low: {
    className: "border-slate-300 text-slate-600 dark:border-slate-700",
    icon: "chevron-down",
  },
  high: {
    className:
      "border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400",
    icon: "chevron-up",
  },
  urgent: {
    className:
      "border-red-300 text-red-700 dark:border-red-700 dark:text-red-400",
    icon: "alert-triangle",
  },
};

export const isPriorityWorthShowing = (
  key: TaskPriorityKey | undefined,
): key is Exclude<TaskPriorityKey, "normal"> =>
  key != null && key !== "normal" && key in PRIORITY_DISPLAY;

/** Dot colour per lifecycle state. */
export const STATUS_DOT_CLASS: Record<TaskStatusKey, string> = {
  pending: "bg-slate-400",
  scheduled: "bg-sky-500",
  in_progress: "bg-blue-500",
  waiting: "bg-amber-500",
  blocked: "bg-red-500",
  rescheduled: "bg-violet-500",
  completed: "bg-green-500",
  canceled: "bg-slate-400",
  archived: "bg-slate-300",
};

const HIDDEN_STATUSES: TaskStatusKey[] = ["pending", "completed"];

export const isStatusWorthShowing = (
  key: TaskStatusKey | undefined,
): key is TaskStatusKey => key != null && !HIDDEN_STATUSES.includes(key);

/**
 * The transitions offered as one-click actions in a list row. The full state
 * machine lives in `public.task_transitions`; this is the shortlist a rep needs
 * without opening the task. An illegal move is still rejected by the database,
 * so this list is a convenience, never the enforcement.
 */
export const QUICK_TRANSITIONS: Record<TaskStatusKey, TaskStatusKey[]> = {
  pending: ["in_progress", "completed", "canceled"],
  scheduled: ["in_progress", "completed", "canceled"],
  in_progress: ["waiting", "blocked", "completed", "canceled"],
  waiting: ["in_progress", "completed", "canceled"],
  blocked: ["in_progress", "canceled"],
  rescheduled: ["in_progress", "completed", "canceled"],
  completed: ["in_progress"],
  canceled: ["pending"],
  archived: [],
};

/** Transitions the database refuses without a reason (§4.4). */
export const TRANSITIONS_REQUIRING_REASON: TaskStatusKey[] = ["canceled"];

export const requiresReason = (to: TaskStatusKey): boolean =>
  TRANSITIONS_REQUIRING_REASON.includes(to);

/**
 * Completion toggle target. Un-checking a completed task reopens it rather
 * than blanking the completion timestamp, which is what destroyed the audit
 * record in the original implementation (§1.3 W3).
 */
export const completionTarget = (status: TaskStatusKey): TaskStatusKey =>
  status === "completed" ? "in_progress" : "completed";
