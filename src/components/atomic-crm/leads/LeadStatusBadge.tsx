import { useRecordContext, useTranslate } from "ra-core";
import { Badge } from "@/components/ui/badge";

import type { LabeledValue, Lead } from "../types";

/**
 * `converted` is not part of the configurable statuses: it is set by
 * `convert_lead()` and always rendered, so a converted lead is obvious in the
 * list even if an installation customises the other statuses.
 */
export const LeadStatusBadge = ({
  choices = [],
}: {
  choices?: LabeledValue[];
}) => {
  const record = useRecordContext<Lead>();
  const translate = useTranslate();

  if (!record?.status) return null;

  if (record.status === "converted") {
    return (
      <Badge
        variant="outline"
        className="border-green-300 dark:border-green-700"
      >
        {translate("resources.leads.statuses.converted")}
      </Badge>
    );
  }

  const label =
    choices.find((choice) => choice.value === record.status)?.label ??
    record.status;

  return <Badge variant="secondary">{label}</Badge>;
};
