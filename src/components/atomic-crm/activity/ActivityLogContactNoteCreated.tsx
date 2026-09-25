import { StickyNote } from "lucide-react";
import { useGetIdentity, useTranslate } from "ra-core";

import { ReferenceField } from "@/components/admin/reference-field";
import { TextField } from "@/components/admin/text-field";
import { useIsMobile } from "@/hooks/use-mobile";

import { useGetSalesName } from "../sales/useGetSalesName";
import type { ActivityContactNoteCreated } from "../types";
import { ActivityLogRow } from "./ActivityLogRow";

type ActivityLogContactNoteCreatedProps = {
  activity: ActivityContactNoteCreated;
};

export function ActivityLogContactNoteCreated({
  activity,
}: ActivityLogContactNoteCreatedProps) {
  const isMobile = useIsMobile();
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const { contactNote } = activity;
  const isCurrentUser = activity.sales_id === identity?.id;
  const salesName = useGetSalesName(activity.sales_id, {
    enabled: !isCurrentUser,
  });
  // An empty note is not an event worth a row.
  if (!contactNote.text) return null;
  const link = isMobile
    ? `/contacts/${contactNote.contact_id}/notes/${contactNote.id}`
    : `/contacts/${contactNote.contact_id}/show`;
  return (
    <ActivityLogRow
      icon={StickyNote}
      emphasis
      date={activity.date}
      note={contactNote.text}
      noteLink={link}
    >
      {translate(
        isCurrentUser
          ? "crm.activity.you_added_note"
          : "crm.activity.added_note",
        { name: salesName },
      )}{" "}
      <ReferenceField
        source="contact_id"
        reference="contacts"
        record={contactNote}
        link="show"
      >
        <TextField source="first_name" /> <TextField source="last_name" />
      </ReferenceField>
    </ActivityLogRow>
  );
}
