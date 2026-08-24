import {
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  RefreshCw,
  UserRoundCog,
} from "lucide-react";
import { useTranslate } from "ra-core";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { Task } from "../types";
import {
  isPriorityWorthShowing,
  isStatusWorthShowing,
  PRIORITY_DISPLAY,
  STATUS_DOT_CLASS,
} from "./taskModel";

const PRIORITY_ICONS = {
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  "alert-triangle": AlertTriangle,
} as const;

/**
 * Priority as an outlined badge with an icon — never colour alone (§16, WCAG
 * 1.4.1). `normal` renders nothing: see `taskModel.isPriorityWorthShowing`.
 */
export const TaskPriorityBadge = ({ task }: { task: Task }) => {
  const translate = useTranslate();

  if (!isPriorityWorthShowing(task.priority_key)) return null;

  const display = PRIORITY_DISPLAY[task.priority_key];
  const Icon = PRIORITY_ICONS[display.icon];
  const label = translate(`resources.tasks.priorities.${task.priority_key}`, {
    _: task.priority_label ?? task.priority_key,
  });

  return (
    <Badge variant="outline" className={cn("gap-1", display.className)}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
};

/**
 * Status as a neutral chip with a coloured dot: priority owns the loud colours,
 * two competing colour systems make a list unreadable (§16).
 */
export const TaskStatusBadge = ({ task }: { task: Task }) => {
  const translate = useTranslate();

  if (!isStatusWorthShowing(task.status_key)) return null;

  const label = translate(`resources.tasks.statuses.${task.status_key}`, {
    _: task.status_label ?? task.status_key,
  });

  return (
    <Badge variant="secondary" className="gap-1.5 font-normal">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          STATUS_DOT_CLASS[task.status_key],
        )}
      />
      {label}
    </Badge>
  );
};

const TraceBadge = ({
  icon,
  text,
  tooltip,
  className,
}: {
  icon: ReactNode;
  text: string;
  tooltip: string;
  className?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-muted-foreground [&>svg]:size-3",
          className,
        )}
      >
        {icon}
        {text}
      </span>
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>
);

/**
 * The traceability badges (§16).
 *
 * These are the whole point of the audit trail as a *product* feature rather
 * than a compliance artefact: "reprogramada ×4" on the row is what changes how
 * a manager reads a pipeline. None of this was computable before — the counters
 * are maintained by the database on every due-date and owner change.
 */
export const TaskTraceabilityBadges = ({ task }: { task: Task }) => {
  const translate = useTranslate();

  const badges: ReactNode[] = [];

  if ((task.reschedule_count ?? 0) > 0) {
    badges.push(
      <TraceBadge
        key="reschedule"
        icon={<RefreshCw />}
        text={`×${task.reschedule_count}`}
        tooltip={translate("resources.tasks.badges.rescheduled", {
          smart_count: task.reschedule_count as number,
        })}
        className="text-amber-600 dark:text-amber-500"
      />,
    );
  }

  if ((task.reassign_count ?? 0) > 0) {
    badges.push(
      <TraceBadge
        key="reassign"
        icon={<UserRoundCog />}
        text={`×${task.reassign_count}`}
        tooltip={translate("resources.tasks.badges.reassigned", {
          smart_count: task.reassign_count as number,
        })}
      />,
    );
  }

  if ((task.comment_count ?? 0) > 0) {
    badges.push(
      <TraceBadge
        key="comments"
        icon={<MessageSquare />}
        text={`${task.comment_count}`}
        tooltip={translate("resources.tasks.badges.comments", {
          smart_count: task.comment_count as number,
        })}
      />,
    );
  }

  if ((task.checklist_total ?? 0) > 0) {
    badges.push(
      <TraceBadge
        key="checklist"
        icon={<CheckSquare />}
        text={`${task.checklist_done ?? 0}/${task.checklist_total}`}
        tooltip={translate("resources.tasks.badges.checklist")}
      />,
    );
  }

  if (badges.length === 0) return null;

  return <span className="inline-flex items-center gap-2">{badges}</span>;
};
