import { useRecordContext, useTranslate } from "ra-core";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { LabeledValue, Lead } from "../types";

/**
 * A lead's position in the funnel, as a dot and a word.
 *
 * The dot carries the state and the word names it, so the column is scannable
 * without being a colour puzzle — and it still reads for someone who cannot
 * separate the hues, because the label is always there.
 *
 * The colours are the SEMANTIC tokens, never the brand hue: the brand marks
 * what is actionable (buttons, the active nav item), and a status badge is a
 * fact about a record, not an action. Statuses an installation adds beyond the
 * four defaults fall through to the neutral dot rather than being assigned a
 * meaning this file cannot know.
 *
 * `converted` is deliberately not part of the configurable list: it is set by
 * `convert_lead()` and always rendered, so a converted lead stays obvious even
 * where the other statuses have been customised. It gets the filled badge —
 * `qualified` is a judgement someone made, `converted` is a thing that happened.
 */
const DOT_BY_STATUS: Record<string, string> = {
  new: "bg-info",
  contacted: "bg-warning",
  qualified: "bg-success",
  unqualified: "bg-muted-foreground",
};

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
      <Badge className="border-transparent bg-success text-success-foreground">
        {translate("resources.leads.statuses.converted")}
      </Badge>
    );
  }

  const label =
    choices.find((choice) => choice.value === record.status)?.label ??
    record.status;

  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          DOT_BY_STATUS[record.status] ?? "bg-muted-foreground",
        )}
        aria-hidden="true"
      />
      {label}
    </Badge>
  );
};
