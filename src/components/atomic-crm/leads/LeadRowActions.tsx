import { Mail, Phone } from "lucide-react";
import { useRecordContext, useTranslate } from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { Lead } from "../types";

/**
 * Call and email, from the row.
 *
 * `tel:` and `mailto:` rather than anything logged: this CRM records an
 * interaction when somebody writes a note or completes a task, and a button
 * that silently created an activity every time a number was tapped would fill
 * the timeline with events nobody performed.
 *
 * A lead with no phone gets a disabled button rather than a missing one, so the
 * action column keeps its width and the rows stay aligned — a column whose
 * contents jump left and right is harder to scan than one with a greyed icon.
 *
 * `stopPropagation` because the row itself is a link to the lead: without it,
 * calling somebody would also navigate away from the list you were working.
 */
const RowAction = ({
  href,
  label,
  icon: Icon,
}: {
  href?: string;
  label: string;
  icon: typeof Phone;
}) => {
  const button = (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:text-foreground"
      disabled={!href}
      asChild={!!href}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
    >
      {href ? (
        <a href={href}>
          <Icon className="size-4" />
        </a>
      ) : (
        <Icon className="size-4" />
      )}
    </Button>
  );

  // A disabled button is not a tooltip trigger in any browser, so the
  // explanation would never appear; the aria-label carries it instead.
  if (!href) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};

export const LeadRowActions = () => {
  const record = useRecordContext<Lead>();
  const translate = useTranslate();

  if (!record) return null;

  return (
    <div className="flex items-center justify-end gap-0.5">
      <RowAction
        href={record.phone ? `tel:${record.phone}` : undefined}
        label={translate("resources.leads.action.call")}
        icon={Phone}
      />
      <RowAction
        href={record.email ? `mailto:${record.email}` : undefined}
        label={translate("resources.leads.action.email")}
        icon={Mail}
      />
    </div>
  );
};
