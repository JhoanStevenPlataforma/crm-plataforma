import type { TaskCatalogEntry } from "../../../types";

/**
 * The seeded task catalogues, mirroring `public.task_statuses` /
 * `task_priorities` / `task_types` (proposal §3.3, §4.1).
 *
 * Demo mode has no database, so these are the same rows the migration seeds.
 * They are shared by the generator (which stamps `status_key` and friends onto
 * generated tasks) and by the fake data provider (which serves them to the
 * `ReferenceInput` on the task form).
 */
export const TASK_STATUSES: (TaskCatalogEntry & {
  is_open: boolean;
  is_terminal: boolean;
  counts_as_done: boolean;
})[] = [
  {
    id: 1,
    key: "pending",
    label: "Pending",
    color: "gray",
    rank: 10,
    is_open: true,
    is_terminal: false,
    counts_as_done: false,
  },
  {
    id: 2,
    key: "scheduled",
    label: "Scheduled",
    color: "sky",
    rank: 20,
    is_open: true,
    is_terminal: false,
    counts_as_done: false,
  },
  {
    id: 3,
    key: "in_progress",
    label: "In progress",
    color: "blue",
    rank: 30,
    is_open: true,
    is_terminal: false,
    counts_as_done: false,
  },
  {
    id: 4,
    key: "waiting",
    label: "Waiting for reply",
    color: "amber",
    rank: 40,
    is_open: true,
    is_terminal: false,
    counts_as_done: false,
  },
  {
    id: 5,
    key: "blocked",
    label: "Blocked",
    color: "red",
    rank: 50,
    is_open: true,
    is_terminal: false,
    counts_as_done: false,
  },
  {
    id: 6,
    key: "rescheduled",
    label: "Rescheduled",
    color: "violet",
    rank: 60,
    is_open: true,
    is_terminal: false,
    counts_as_done: false,
  },
  {
    id: 7,
    key: "completed",
    label: "Completed",
    color: "green",
    rank: 70,
    is_open: false,
    is_terminal: true,
    counts_as_done: true,
  },
  {
    id: 8,
    key: "canceled",
    label: "Cancelled",
    color: "gray",
    rank: 80,
    is_open: false,
    is_terminal: true,
    counts_as_done: false,
  },
  {
    id: 9,
    key: "archived",
    label: "Archived",
    color: "gray",
    rank: 90,
    is_open: false,
    is_terminal: true,
    counts_as_done: false,
  },
];

export const TASK_PRIORITIES: (TaskCatalogEntry & {
  sla_hours: number | null;
})[] = [
  {
    id: 1,
    key: "low",
    label: "Low",
    color: "slate",
    rank: 10,
    sla_hours: null,
  },
  {
    id: 2,
    key: "normal",
    label: "Normal",
    color: "slate",
    rank: 20,
    sla_hours: 72,
  },
  {
    id: 3,
    key: "high",
    label: "High",
    color: "orange",
    rank: 30,
    sla_hours: 24,
  },
  {
    id: 4,
    key: "urgent",
    label: "Urgent",
    color: "red",
    rank: 40,
    sla_hours: 4,
  },
];

export const statusByKey = (key: string) =>
  TASK_STATUSES.find((status) => status.key === key) ?? TASK_STATUSES[0];

export const priorityByKey = (key: string) =>
  TASK_PRIORITIES.find((priority) => priority.key === key) ??
  TASK_PRIORITIES[1];
