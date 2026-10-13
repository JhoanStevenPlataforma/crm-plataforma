import { useState } from "react";
import { useTranslate, type Identifier } from "ra-core";

import { EmailMessageDialog } from "../emails/EmailMessageDialog";
import { EmailStatusBadge } from "../emails/EmailStatusBadge";
import { emailMessageText } from "../emails/emailTemplate";
import type { EmailMessage, EmailStatus, TimelineEvent } from "../types";

/**
 * A message to a customer, on the timeline of the record it was sent from:
 * who it went to, its subject and how the delivery stands -- a failed send is
 * an event too. The text is one click away, in the message itself.
 */
export const EmailEventDetails = ({ event }: { event: TimelineEvent }) => {
  const translate = useTranslate();
  const [isOpen, setIsOpen] = useState(false);
  const payload = event.payload ?? {};
  const messageId = payload.message_id as Identifier | undefined;
  const status = payload.status as EmailStatus | undefined;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">
          {translate("crm.email.message.to", {
            address: String(payload.to_email ?? ""),
          })}
        </span>
        {status ? <EmailStatusBadge status={status} /> : null}
      </div>
      {messageId != null ? (
        <button
          type="button"
          className="w-fit cursor-pointer text-left hover:underline"
          onClick={() => setIsOpen(true)}
        >
          {
            emailMessageText({
              subject: String(payload.subject ?? ""),
              origin: payload.origin as EmailMessage["origin"] | undefined,
              language: payload.language as EmailMessage["language"],
              variables:
                (payload.variables as EmailMessage["variables"] | null) ??
                undefined,
            }).subject
          }
        </button>
      ) : null}
      {isOpen && messageId != null ? (
        <EmailMessageDialog
          messageId={messageId}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </div>
  );
};
