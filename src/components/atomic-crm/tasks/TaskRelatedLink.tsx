import { Building2, CircleDollarSign, Sparkles, User } from "lucide-react";
import { useTranslate } from "ra-core";
import { Link } from "react-router";

import type { Task, TaskEntityType } from "../types";

/**
 * The record a task hangs off (proposal §14.2).
 *
 * A task used to be pinned to a contact by a NOT NULL foreign key, so the row
 * could only ever say "regarding <contact>". Now the primary link may be a
 * lead, a company or a deal, and `tasks_summary` resolves its type, id and a
 * label snapshot in the same query.
 */
const ENTITY_ROUTES: Partial<Record<TaskEntityType, string>> = {
  contact: "contacts",
  lead: "leads",
  company: "companies",
  deal: "deals",
};

const ENTITY_ICONS: Partial<Record<TaskEntityType, typeof User>> = {
  contact: User,
  lead: Sparkles,
  company: Building2,
  deal: CircleDollarSign,
};

export const TaskRelatedLink = ({ task }: { task: Task }) => {
  const translate = useTranslate();

  const entityType = task.primary_entity_type;
  const entityId = task.primary_entity_id;

  if (!entityType || entityId == null) return null;

  const route = ENTITY_ROUTES[entityType];
  const Icon = ENTITY_ICONS[entityType];

  // The label is a snapshot taken when the link was created, so it survives the
  // record being deleted (§14.3) — the timeline can still name what the task
  // was about.
  const label =
    task.primary_entity_label ??
    translate(`resources.tasks.entities.${entityType}`, { _: entityType });

  const content = (
    <span className="inline-flex items-center gap-1 [&>svg]:size-3">
      {Icon ? <Icon aria-hidden="true" /> : null}
      {label}
    </span>
  );

  if (!route) return content;

  return (
    <Link
      to={`/${route}/${entityId}/show`}
      className="inline-flex items-center hover:underline"
    >
      {content}
    </Link>
  );
};
