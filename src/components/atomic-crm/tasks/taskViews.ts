import type { TaskStatusKey } from "../types";

/**
 * The three shapes the task page can take (proposal §15.1, V2/V6/V7).
 *
 * Kept as a module rather than inline in the page so the view name can be
 * parsed from the URL in one place: the view is shareable state, so it lives in
 * the query string, and an unknown value has to degrade to the list rather than
 * render nothing.
 */
export type TaskView = "list" | "kanban" | "calendar";

export const TASK_VIEWS: TaskView[] = ["list", "kanban", "calendar"];

export const parseTaskView = (value: string | null): TaskView =>
  TASK_VIEWS.includes(value as TaskView) ? (value as TaskView) : "list";

/**
 * The kanban columns (§15.4).
 *
 * Open states only, plus `completed` as the drop target that closes the work.
 * `canceled` and `archived` are deliberately absent: cancelling requires a
 * reason (§4.4), which a drag cannot supply, and a column nobody can drop into
 * is furniture. Both stay available from the row menu.
 */
export const KANBAN_COLUMNS: TaskStatusKey[] = [
  "pending",
  "scheduled",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
];

/**
 * What a drop on the board means (§15.4).
 *
 * Extracted from the component because the decision — not every drop is a
 * transition — is the part worth pinning down: a card released outside a column
 * or back where it started must produce no write at all, or the board would
 * emit audit events for gestures the user cancelled.
 */
export const resolveKanbanDrop = (result: {
  draggableId: string;
  source: { droppableId: string };
  destination?: { droppableId: string } | null;
}): { taskId: number; to: TaskStatusKey } | null => {
  const { draggableId, source, destination } = result;
  if (!destination) return null;
  if (destination.droppableId === source.droppableId) return null;

  return {
    taskId: Number(draggableId),
    to: destination.droppableId as TaskStatusKey,
  };
};

/**
 * Column headers get a tint so the board is scannable, but the drop zone stays
 * neutral — priority owns the loud colours (§16).
 */
export const KANBAN_COLUMN_CLASS: Record<string, string> = {
  // The lane's marker (a dot and the lane's top edge), in the semantic
  // tokens: grey waits, blue moves, amber is stuck on somebody else, red is
  // stuck, green is done. The lane title itself stays in the text colour.
  pending: "bg-muted-foreground",
  scheduled: "bg-info",
  in_progress: "bg-info",
  waiting: "bg-warning",
  blocked: "bg-destructive",
  completed: "bg-success",
};
