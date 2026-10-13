import { useState } from "react";
import { Mail, Phone } from "lucide-react";
import { useRecordContext, useTranslate } from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { EmailComposeDialog } from "../emails/EmailComposeDialog";
import { useEmailStatus } from "../emails/useEmailStatus";
import type { Lead } from "../types";

/**
 * Call and email, from the row.
 *
 * `tel:` rather than anything logged: this CRM records an interaction when
 * somebody writes a note or completes a task, and a button that silently
 * created an activity every time a number was tapped would fill the timeline
 * with events nobody performed.
 *
 * Email opens the CRM's compose dialog, the one on the lead's page, so the
 * message leaves through the configured provider and is recorded on the lead.
 * While outbound email is switched off it falls back to `mailto:`.
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
  onAction,
  label,
  icon: Icon,
}: {
  href?: string;
  /** What the button does when it is not a link. */
  onAction?: () => void;
  label: string;
  icon: typeof Phone;
}) => {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:text-foreground"
      disabled={!href && !onAction}
      asChild={!!href}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onAction?.();
      }}
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
  if (!href && !onAction) return button;

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
  const [isComposing, setIsComposing] = useState(false);
  const { data: emailStatus } = useEmailStatus();

  if (!record) return null;

  const emailAction = !record.email
    ? {}
    : emailStatus?.is_enabled
      ? { onAction: () => setIsComposing(true) }
      : { href: `mailto:${record.email}` };

  return (
    <div className="flex items-center justify-end gap-0.5">
      <RowAction
        href={record.phone ? `tel:${record.phone}` : undefined}
        label={translate("resources.leads.action.call")}
        icon={Phone}
      />
      <RowAction
        {...emailAction}
        label={translate("resources.leads.action.email")}
        icon={Mail}
      />
      {isComposing ? (
        // React events cross a portal: without this, a click inside the
        // dialog would reach the row and navigate to the lead.
        <span onClick={(event) => event.stopPropagation()}>
          <EmailComposeDialog
            open
            entityType="lead"
            entityId={record.id}
            onClose={() => setIsComposing(false)}
          />
        </span>
      ) : null}
    </div>
  );
};
