import type { TaskEntityType, TaskNotification } from "../types";

/**
 * Where a notification takes you when you click it.
 *
 * The bell was deliberately inert until now: "clicking an entry marks it read
 * and nothing else — no navigation guess", because a task reminder names its
 * task in the text and where the user goes from there is their call. That
 * reasoning does not survive the outbox being widened (quotes §8). A quote
 * notification says a customer accepted, declined or wrote on a quotation, and
 * the one place to act on it is that quotation — there is nothing to guess.
 *
 * So: a row with an entity subject links; a task row keeps the old behaviour.
 *
 * `task_entity` names nine entity kinds and this CRM routes four of them.
 * `project`, `ticket`, `invoice` and `order` are reserved in the enum for
 * modules that do not exist yet (§12), and a link to a route the router does
 * not have is worse than no link — it lands the user on a blank page rather
 * than leaving the notification where they can still read it.
 */
const ROUTED_ENTITIES: Partial<Record<TaskEntityType, string>> = {
  quote: "quotes",
  contact: "contacts",
  company: "companies",
  deal: "deals",
};

/**
 * The route for a notification, or `null` when it has nowhere to go.
 *
 * Pure, so the mapping is testable without a router: which notifications are
 * actionable is a product decision, not a rendering detail.
 */
export const notificationLink = (
  notification: Pick<TaskNotification, "entity_type" | "entity_id">,
): string | null => {
  const { entity_type: entityType, entity_id: entityId } = notification;
  if (!entityType || entityId == null) return null;

  const resource = ROUTED_ENTITIES[entityType];
  if (!resource) return null;

  return `/${resource}/${entityId}/show`;
};
