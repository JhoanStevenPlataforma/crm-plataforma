import { StickyNote } from "lucide-react";
import { type RaRecord, useGetIdentity, useTranslate } from "ra-core";

import { ReferenceField } from "@/components/admin/reference-field";
import { useIsMobile } from "@/hooks/use-mobile";

import { useGetSalesName } from "../sales/useGetSalesName";
import type { ActivityDealNoteCreated } from "../types";
import { useActivityLogContext } from "./ActivityLogContext";
import { ActivityLogRow } from "./ActivityLogRow";

type ActivityLogDealNoteCreatedProps = {
  activity: RaRecord & ActivityDealNoteCreated;
};

export function ActivityLogDealNoteCreated({
  activity,
}: ActivityLogDealNoteCreatedProps) {
  const context = useActivityLogContext();
  const isMobile = useIsMobile();
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const { dealNote } = activity;
  const isCurrentUser = activity.sales_id === identity?.id;
  const salesName = useGetSalesName(activity.sales_id, {
    enabled: !isCurrentUser,
  });
  // An empty note is not an event worth a row.
  if (!dealNote.text) return null;
  return (
    <ActivityLogRow
      icon={StickyNote}
      emphasis
      date={activity.date}
      note={dealNote.text}
      noteLink={isMobile ? false : `/deals/${dealNote.deal_id}/show`}
    >
      {translate(
        isCurrentUser
          ? "crm.activity.you_added_note_about_deal"
          : "crm.activity.added_note_about_deal",
        { name: salesName },
      )}{" "}
      <ReferenceField
        source="deal_id"
        reference="deals"
        record={dealNote}
        link={isMobile ? false : "show"}
      />
      {context !== "company" ? (
        <>
          {" "}
          {translate("crm.activity.at_company")}{" "}
          <ReferenceField
            source="deal_id"
            reference="deals"
            record={dealNote}
            link={false}
          >
            <ReferenceField
              source="company_id"
              reference="companies"
              link="show"
            />
          </ReferenceField>
        </>
      ) : null}
    </ActivityLogRow>
  );
}
