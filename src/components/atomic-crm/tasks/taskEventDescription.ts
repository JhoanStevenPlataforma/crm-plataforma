import type { TaskEvent } from "../types";

/**
 * Turns one immutable audit row into something a human can read (proposal §6.3).
 *
 * The event stream is deliberately raw — field name, old jsonb, new jsonb — so
 * that it never has to change when the UI does. All the interpretation lives
 * here, which also makes it the only piece that needs testing.
 */

export type DescribedTaskEvent = {
  /** i18n key under `resources.tasks.history.events`. */
  key: string;
  /** Previous value, already flattened out of its jsonb envelope. */
  from?: string;
  /** New value, likewise. */
  to?: string;
  /** The reason or note the actor gave, when the transition required one. */
  reason?: string;
  /** True when nothing but the event name is worth rendering. */
  isBare: boolean;
};

const unwrap = (
  value: Record<string, unknown> | null | undefined,
  field: string | null | undefined,
): unknown => {
  if (value == null) return undefined;
  if (field && field in value) return value[field];
  return undefined;
};

/**
 * jsonb values arrive as strings, numbers, booleans or null. Dates are kept as
 * ISO strings on purpose: formatting them is the component's job, because it
 * depends on the user's locale.
 */
export const formatEventValue = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
};

export const describeTaskEvent = (event: TaskEvent): DescribedTaskEvent => {
  const metadata = event.metadata ?? {};

  const reason =
    typeof metadata.reason === "string"
      ? metadata.reason
      : (event.note ?? undefined);

  // A status transition carries readable keys in its metadata; the raw
  // `status_id` numbers in old_value/new_value are useless to a reader.
  const fromStatus = metadata.from_status;
  const toStatus = metadata.to_status;
  if (typeof fromStatus === "string" && typeof toStatus === "string") {
    return {
      key: event.event_type,
      from: fromStatus,
      to: toStatus,
      reason,
      isBare: false,
    };
  }

  const from = formatEventValue(unwrap(event.old_value, event.field));
  const to = formatEventValue(unwrap(event.new_value, event.field));

  return {
    key: event.event_type,
    from,
    to,
    reason,
    isBare: from === undefined && to === undefined,
  };
};

/**
 * How far a due date moved, in whole days, from the metadata the database
 * attaches to `task.rescheduled`. Returns undefined when the event is not a
 * reschedule or carries no delta.
 */
export const rescheduleDeltaDays = (event: TaskEvent): number | undefined => {
  const delta = event.metadata?.delta_seconds;
  if (typeof delta !== "number" || Number.isNaN(delta)) return undefined;
  return Math.round(delta / 86400);
};

/**
 * Events produced by the system or an automation are collapsed by default in
 * the timeline: showing every field-level write next to human activity is what
 * makes an audit trail unreadable (§6.4).
 */
export const isHumanEvent = (event: TaskEvent): boolean =>
  event.actor_kind === "user";
