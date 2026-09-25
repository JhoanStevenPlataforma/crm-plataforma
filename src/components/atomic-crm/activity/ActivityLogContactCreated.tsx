import { UserPlus } from "lucide-react";
import { useGetIdentity, useTranslate } from "ra-core";
import { Link } from "react-router";

import { ReferenceField } from "@/components/admin/reference-field";

import { useGetSalesName } from "../sales/useGetSalesName";
import type { ActivityContactCreated } from "../types";
import { useActivityLogContext } from "./ActivityLogContext";
import { ActivityLogRow } from "./ActivityLogRow";

type ActivityLogContactCreatedProps = {
  activity: ActivityContactCreated;
};

export function ActivityLogContactCreated({
  activity,
}: ActivityLogContactCreatedProps) {
  const context = useActivityLogContext();
  const translate = useTranslate();
  const { contact } = activity;
  const { identity, isPending } = useGetIdentity();
  const isCurrentUser = !isPending && identity?.id === activity.sales_id;
  const salesName = useGetSalesName(activity.sales_id, {
    enabled: !isCurrentUser,
  });
  return (
    <ActivityLogRow icon={UserPlus} date={activity.date}>
      {translate(
        isCurrentUser
          ? "crm.activity.you_added_contact"
          : "crm.activity.added_contact",
        { name: salesName },
      )}{" "}
      <Link to={`/contacts/${contact.id}/show`}>
        {contact.first_name} {contact.last_name}
      </Link>
      {/* On a company's own page the company is implied. */}
      {context !== "company" && activity.company_id != null ? (
        <>
          {" "}
          {translate("crm.activity.to")}{" "}
          <ReferenceField
            source="company_id"
            reference="companies"
            record={activity}
            link="show"
          />
        </>
      ) : null}
    </ActivityLogRow>
  );
}
