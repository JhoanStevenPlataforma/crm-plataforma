import get from "lodash/get";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";
import type { Deal, DealNote } from "@/components/atomic-crm/types";

import { englishCrmMessages } from "../providers/commons/englishCrmMessages";
import { frenchCrmMessages } from "../providers/commons/frenchCrmMessages";
import { spanishCrmMessages } from "../providers/commons/spanishCrmMessages";
import { EntityTimeline } from "./EntityTimeline";

/**
 * Every event a timeline can show, pinned here: the values of
 * `public.task_event_type` (supabase/schemas/01_tables.sql), plus what the
 * other arms of `timeline_events` (03_views.sql) emit on a record page. A new
 * enum value added in SQL and not here is a label nobody wrote; add it to this
 * list and to the three catalogs together.
 */
const TIMELINE_EVENT_TYPES = [
  "task.created",
  "task.updated",
  "task.scheduled",
  "task.started",
  "task.waiting",
  "task.resumed",
  "task.blocked",
  "task.unblocked",
  "task.completed",
  "task.reopened",
  "task.canceled",
  "task.archived",
  "task.unarchived",
  "task.deleted",
  "task.restored",
  "task.rescheduled",
  "task.priority_changed",
  "task.type_changed",
  "task.title_changed",
  "task.description_changed",
  "task.due_removed",
  "task.assigned",
  "task.unassigned",
  "task.reassigned",
  "task.watcher_added",
  "task.watcher_removed",
  "task.team_assigned",
  "comment.created",
  "comment.edited",
  "comment.deleted",
  "comment.reaction_added",
  "comment.reaction_removed",
  "mention.created",
  "attachment.added",
  "attachment.removed",
  "checklist.item_added",
  "checklist.item_completed",
  "checklist.item_reopened",
  "checklist.item_removed",
  "checklist.item_reordered",
  "link.added",
  "link.removed",
  "link.primary_changed",
  "dependency.added",
  "dependency.removed",
  "dependency.satisfied",
  "timelog.started",
  "timelog.stopped",
  "timelog.edited",
  "reminder.created",
  "reminder.updated",
  "reminder.canceled",
  "reminder.sent",
  "reminder.failed",
  "reminder.acknowledged",
  "automation.applied",
  "sla.breached",
  "sla.warning",
  "import.applied",
  // The non-task arms of `timeline_events`.
  "note.created",
  "deal.stage_changed",
  "quote.status_changed",
  "quote.commented",
];

const CATALOGS = {
  en: englishCrmMessages,
  es: spanishCrmMessages,
  fr: frenchCrmMessages,
};

describe("timeline event labels", () => {
  it.each(Object.entries(CATALOGS))(
    "names every event in %s instead of showing its key",
    (_locale, catalog) => {
      const unlabelled = TIMELINE_EVENT_TYPES.filter(
        (eventType) =>
          typeof get(
            catalog,
            `resources.tasks.history.events.${eventType.replace(/\./g, "_")}`,
          ) !== "string",
      );

      expect(unlabelled).toEqual([]);
    },
  );

  it("shows a note on the deal timeline as words, not as note.created", async () => {
    // Arrange
    const deal = {
      id: 1,
      name: "Acme renewal",
      company_id: 1,
      contact_ids: [],
      category: "other",
      stage: "opportunity",
      description: "",
      amount: 1000,
      created_at: "2026-08-01T09:00:00.000Z",
      updated_at: "2026-08-01T09:00:00.000Z",
      expected_closing_date: "2026-09-01",
      sales_id: 0,
      index: 0,
    } satisfies Deal;
    const note = {
      id: 1,
      deal_id: 1,
      text: "Called the buyer",
      date: "2026-08-02T09:00:00.000Z",
      sales_id: 0,
    } as DealNote;

    // Act
    const screen = await render(
      <StoryWrapper data={{ deals: [deal], deal_notes: [note] }}>
        <EntityTimeline entityType="deal" entityId={1} />
      </StoryWrapper>,
    );

    // Assert
    await expect.element(screen.getByText("Note added")).toBeVisible();
    await expect
      .element(screen.getByText("note.created"))
      .not.toBeInTheDocument();
  });
});
