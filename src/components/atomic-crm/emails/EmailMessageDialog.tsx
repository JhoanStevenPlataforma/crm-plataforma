import { useMutation } from "@tanstack/react-query";
import {
  useDataProvider,
  useGetIdentity,
  useGetList,
  useGetOne,
  useLocaleState,
  useNotify,
  useRefresh,
  useTranslate,
  type Identifier,
} from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

import { emailErrorMessage } from "../providers/commons/emailRpc";
import type { CrmDataProvider } from "../providers/types";
import type { EmailMessage, EmailMessageEvent } from "../types";
import { EmailStatusBadge } from "./EmailStatusBadge";
import { useEmailStatus } from "./useEmailStatus";

const formatMoment = (value: string | null | undefined, locale: string) =>
  value
    ? new Date(value).toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

/**
 * One message, as it was written and as its delivery went
 * (docs/proposals/outbound-email.md).
 *
 * The text shown is the stored one, with the `{{quote_link}}` marker where the
 * link was: the link itself is never kept. A failed message can be queued
 * again by its sender or a manager -- the same message, not a copy.
 */
export const EmailMessageDialog = ({
  messageId,
  onClose,
}: {
  messageId: Identifier | null;
  onClose: () => void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const [locale = "en"] = useLocaleState();
  const { identity } = useGetIdentity();
  const { data: status } = useEmailStatus();

  const { data: message, error } = useGetOne<EmailMessage>(
    "email_messages",
    { id: messageId as Identifier },
    { enabled: messageId != null },
  );

  // What the provider reported afterwards: the evidence behind "delivered"
  // and "bounced", oldest first.
  const { data: events = [] } = useGetList<EmailMessageEvent>(
    "email_message_events",
    {
      filter: { message_id: messageId },
      sort: { field: "occurred_at", order: "ASC" },
      pagination: { page: 1, perPage: 50 },
    },
    { enabled: messageId != null },
  );

  const { mutate: retry, isPending } = useMutation({
    mutationFn: (id: Identifier) => dataProvider.retryEmail(id),
    onSuccess: () => {
      notify("crm.email.message.retried");
      refresh();
    },
    onError: (failure) => notify(emailErrorMessage(failure), { type: "error" }),
  });

  const canRetry =
    message?.status === "failed" &&
    (status?.can_send_any === true ||
      (identity != null && String(identity.id) === String(message.sales_id)));

  const moments: Array<[string, string | null]> = message
    ? [
        ["created", formatMoment(message.created_at, locale)],
        ["accepted", formatMoment(message.accepted_at, locale)],
        ["delivered", formatMoment(message.delivered_at, locale)],
        ["bounced", formatMoment(message.bounced_at, locale)],
        ["failed", formatMoment(message.failed_at, locale)],
      ]
    : [];

  return (
    <Dialog
      open={messageId != null}
      onOpenChange={(next) => {
        if (!next && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {message?.subject ?? translate("crm.email.message.title")}
          </DialogTitle>
          <DialogDescription>
            {message
              ? translate("crm.email.message.to", {
                  address: message.to_name
                    ? `${message.to_name} <${message.to_email}>`
                    : message.to_email,
                })
              : translate("crm.email.message.title")}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {translate("crm.email.history.load_error")}
          </p>
        ) : !message ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <EmailStatusBadge status={message.status} />
              {message.attempt > 1 ? (
                <span className="text-xs text-muted-foreground">
                  {translate("crm.email.message.attempts", {
                    count: message.attempt,
                  })}
                </span>
              ) : null}
            </div>

            <p className="text-muted-foreground">
              {translate(`crm.email.result.${message.status}`)}
            </p>

            {message.error_code ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
              >
                <p>
                  {translate(
                    `crm.email.delivery_errors.${message.error_code}`,
                    { _: message.error_code },
                  )}
                </p>
                {message.error ? (
                  <p className="mt-1 text-xs break-words text-muted-foreground">
                    {message.error}
                  </p>
                ) : null}
              </div>
            ) : null}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {moments
                .filter(([, value]) => value != null)
                .map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">
                      {translate(`crm.email.message.moments.${key}`)}
                    </dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              {message.variables?.quote_number ? (
                <div className="contents">
                  <dt className="text-muted-foreground">
                    {translate("crm.email.message.quote")}
                  </dt>
                  <dd>
                    {translate("crm.email.message.quote_version", {
                      number: message.variables.quote_number,
                      version: message.variables.quote_version ?? "",
                    })}
                  </dd>
                </div>
              ) : null}
              {message.provider_message_id ? (
                <div className="contents">
                  <dt className="text-muted-foreground">
                    {translate("crm.email.message.provider_id")}
                  </dt>
                  <dd className="font-mono text-xs break-all">
                    {message.provider_message_id}
                  </dd>
                </div>
              ) : null}
            </dl>

            {events.length > 0 ? (
              <div className="flex flex-col gap-1">
                <h4 className="text-xs font-medium text-muted-foreground">
                  {translate("crm.email.events.title")}
                </h4>
                <ul className="flex flex-col gap-1">
                  {events.map((event) => (
                    <li key={event.id} className="border-l-2 pl-3">
                      <span>
                        {translate(`crm.email.events.${event.event_type}`)}
                        {event.is_permanent
                          ? ` (${translate("crm.email.events.permanent")})`
                          : null}
                      </span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {formatMoment(event.occurred_at, locale)}
                      </span>
                      {event.detail ? (
                        <p className="text-xs break-words text-muted-foreground">
                          {event.detail}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <pre className="max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-3 font-sans text-sm whitespace-pre-wrap">
              {message.body_text}
            </pre>
          </div>
        )}

        <DialogFooter>
          {canRetry && message ? (
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => retry(message.id)}
            >
              {translate("crm.email.message.retry")}
            </Button>
          ) : null}
          <Button disabled={isPending} onClick={onClose}>
            {translate("ra.action.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
