import { useState } from "react";
import {
  useGetList,
  useLocaleState,
  useTranslate,
  type Identifier,
} from "ra-core";

import type { EmailEntityType, EmailMessage } from "../types";
import { emailMessageText } from "./emailTemplate";
import { EmailMessageDialog } from "./EmailMessageDialog";
import { EmailStatusBadge } from "./EmailStatusBadge";
import { SendEmailButton } from "./SendEmailButton";

/** A record has a handful of messages, not a page of them. */
const PANEL_PAGE = { page: 1, perPage: 25 };

/**
 * The messages sent from one record, newest first, and the button to write
 * another (docs/proposals/outbound-email.md).
 *
 * Used where a record has no timeline (a contact, a quotation). Records that
 * have one show their messages there instead, as `email.message` events, so
 * the same history is not listed twice on a page.
 */
export const EntityEmailsPanel = ({
  entityType,
  entityId,
  sendLabel,
  canSend = true,
}: {
  entityType: EmailEntityType;
  entityId: Identifier;
  sendLabel?: string;
  /** False where the page offers the button elsewhere, or not at all. */
  canSend?: boolean;
}) => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const [openId, setOpenId] = useState<Identifier | null>(null);

  const { data: messages, error } = useGetList<EmailMessage>("email_messages", {
    filter: { entity_type: entityType, entity_id: entityId },
    sort: { field: "created_at", order: "DESC" },
    pagination: PANEL_PAGE,
  });

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p className="text-sm text-destructive">
          {translate("crm.email.history.load_error")}
        </p>
      ) : (messages ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("crm.email.history.empty")}
        </p>
      ) : (
        <ul className="flex flex-col">
          {(messages ?? []).map((message) => (
            <li key={message.id} className="border-t first:border-t-0">
              <button
                type="button"
                className="flex w-full cursor-pointer flex-col gap-1 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() => setOpenId(message.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {emailMessageText(message).subject}
                  </span>
                  <EmailStatusBadge status={message.status} />
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {message.to_email}
                  {" · "}
                  {new Date(message.created_at).toLocaleString(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {canSend ? (
        <div>
          <SendEmailButton
            entityType={entityType}
            entityId={entityId}
            label={sendLabel}
          />
        </div>
      ) : null}

      <EmailMessageDialog messageId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
};
