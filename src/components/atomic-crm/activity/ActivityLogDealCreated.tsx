import { Target } from "lucide-react";
import { type RaRecord, useGetIdentity, useTranslate } from "ra-core";
import { Link } from "react-router";

import { ReferenceField } from "@/components/admin/reference-field";
import { useIsMobile } from "@/hooks/use-mobile";

import { useGetSalesName } from "../sales/useGetSalesName";
import type { ActivityDealCreated } from "../types";
import { useActivityLogContext } from "./ActivityLogContext";
import { ActivityLogRow } from "./ActivityLogRow";

type ActivityLogDealCreatedProps = {
  activity: RaRecord & ActivityDealCreated;
};

export function ActivityLogDealCreated({
  activity,
}: ActivityLogDealCreatedProps) {
  const context = useActivityLogContext();
  const isMobile = useIsMobile();
  const translate = useTranslate();
  const { deal } = activity;
  const { identity, isPending } = useGetIdentity();
  const isCurrentUser = !isPending && identity?.id === activity.sales_id;
  const salesName = useGetSalesName(activity.sales_id, {
    enabled: !isCurrentUser,
  });
  return (
    <ActivityLogRow icon={Target} date={activity.date}>
      {translate(
        isCurrentUser
          ? "crm.activity.you_added_deal"
          : "crm.activity.added_deal",
        { name: salesName },
      )}{" "}
      {isMobile ? (
        <span className="font-medium text-foreground">{deal.name}</span>
      ) : (
        <Link to={`/deals/${deal.id}/show`}>{deal.name}</Link>
      )}
      {context !== "company" ? (
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
