import { useGetList, useTranslate, type Identifier } from "ra-core";
import { useMemo, useState } from "react";

import { DateField } from "@/components/admin/date-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { Sale, TaskEntityType, TimelineEvent } from "../types";
import { StageChangeDetails } from "./StageChangeDetails";
import { isDefaultVisible } from "./timelineEventCategory";

const PAGE_SIZE = 25;

const eventLabelKey = (eventType: string) =>
  `resources.tasks.history.events.${eventType.replace(/\./g, "_")}`;

/**
 * The unified timeline of one record (proposal §6).
 *
 * Reads `timeline_events`, which merges the task event stream with the notes
 * on the same record, so a user sees one chronological story instead of
 * checking three places. Before this, `activity_log` did not know tasks existed
 * at all (W9).
 *
 * The default view hides field-level edits and automation noise behind a
 * toggle. That is not a nicety: §6.4 calls showing every event by default "the
 * classic mistake that makes an audit timeline unusable".
 */
export const EntityTimeline = ({
  entityType,
  entityId,
}: {
  entityType: TaskEntityType;
  entityId: Identifier;
}) => {
  const translate = useTranslate();
  const [showAll, setShowAll] = useState(false);
  const [perPage, setPerPage] = useState(PAGE_SIZE);

  const { data, total, isPending, error } = useGetList<TimelineEvent>(
    "timeline_events",
    {
      filter: { entity_type: entityType, entity_id: entityId },
      sort: { field: "occurred_at", order: "DESC" },
      pagination: { page: 1, perPage },
    },
  );

  const events = useMemo(
    () => (data ?? []).filter((event) => showAll || isDefaultVisible(event)),
    [data, showAll],
  );

  const hiddenCount = (data?.length ?? 0) - events.length;

  if (isPending) return null;

  if (error || (data?.length ?? 0) === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {translate("resources.tasks.timeline.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {events.map((event) => (
          <li
            key={event.id}
            className="flex flex-col gap-0.5 border-l-2 pl-3 py-0.5"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">
                {translate(eventLabelKey(event.event_type), {
                  _: event.event_type,
                })}
              </span>

              {event.actor_sales_id != null ? (
                <ReferenceField<TimelineEvent, Sale>
                  source="actor_sales_id"
                  reference="sales"
                  record={event}
                  className="inline text-sm text-muted-foreground"
                  render={({ referenceRecord }) =>
                    referenceRecord ? (
                      <>
                        {translate("resources.tasks.history.by", {
                          name: `${referenceRecord.first_name} ${referenceRecord.last_name}`,
                        })}
                      </>
                    ) : null
                  }
                />
              ) : (
                <span className="text-sm text-muted-foreground">
                  {translate("resources.tasks.history.system")}
                </span>
              )}

              {event.actor_kind !== "user" && (
                <Badge variant="outline" className="text-[10px]">
                  {event.actor_kind}
                </Badge>
              )}
            </div>

            {event.event_type === "deal.stage_changed" ? (
              <StageChangeDetails event={event} />
            ) : null}

            <DateField
              source="occurred_at"
              record={event}
              showDate
              showTime
              className="text-xs text-muted-foreground"
            />
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-center gap-4">
        {(hiddenCount > 0 || showAll) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll
              ? translate("resources.tasks.timeline.show_fewer")
              : translate("resources.tasks.timeline.show_all", {
                  smart_count: hiddenCount,
                })}
          </Button>
        )}

        {total != null && total > perPage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPerPage(perPage + PAGE_SIZE)}
          >
            {translate("resources.tasks.history.load_more")}
          </Button>
        )}
      </div>
    </div>
  );
};
