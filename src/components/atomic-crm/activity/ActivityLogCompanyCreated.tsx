import { Building2 } from "lucide-react";
import { useGetIdentity, useTranslate } from "ra-core";
import { Link } from "react-router";

import { useGetSalesName } from "../sales/useGetSalesName";
import type { ActivityCompanyCreated } from "../types";
import { ActivityLogRow } from "./ActivityLogRow";

type ActivityLogCompanyCreatedProps = {
  activity: ActivityCompanyCreated;
};

export function ActivityLogCompanyCreated({
  activity,
}: ActivityLogCompanyCreatedProps) {
  const translate = useTranslate();
  const { identity, isPending } = useGetIdentity();
  const { company } = activity;
  const isCurrentUser = !isPending && identity?.id === activity.sales_id;
  const salesName = useGetSalesName(activity.sales_id, {
    enabled: !isCurrentUser,
  });
  return (
    <ActivityLogRow icon={Building2} date={activity.date}>
      {translate(
        isCurrentUser
          ? "crm.activity.you_added_company"
          : "crm.activity.added_company",
        { name: salesName },
      )}{" "}
      <Link to={`/companies/${company.id}/show`}>{company.name}</Link>
    </ActivityLogRow>
  );
}
