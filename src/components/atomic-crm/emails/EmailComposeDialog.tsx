import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, FlaskConical } from "lucide-react";
import {
  useDataProvider,
  useGetList,
  useLocaleState,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  EMAIL_ERROR,
  EmailRpcError,
  emailErrorMessage,
} from "../providers/commons/emailRpc";
import type { CrmDataProvider } from "../providers/types";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { EmailEntityType, EmailMessage, EmailTemplate } from "../types";
import { EmailComposeFields } from "./EmailComposeFields";
import { EmailPreview } from "./EmailPreview";
import { EmailStatusBadge } from "./EmailStatusBadge";
import {
  asEmailLanguage,
  defaultTemplate,
  fillTemplate,
  templatesFor,
  unresolvedVariables,
} from "./emailTemplate";

const TEMPLATES_PAGE = { page: 1, perPage: 100 };
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/**
 * Write a message to a customer from a record, look at it, send it
 * (docs/proposals/outbound-email.md).
 *
 * For a quotation it shares the newest ISSUED version and nothing else: the
 * dialog never issues, and when that version cannot be shared it says why
 * instead of offering a button the server would refuse.
 *
 * Every rule shown here -- who may be written to, what may be shared, the
 * duplicate warning -- is the server's, read from `email_context()` or from a
 * refusal's key. This component decides nothing.
 */
export const EmailComposeDialog = ({
  open,
  entityType,
  entityId,
  onClose,
}: {
  open: boolean;
  entityType: EmailEntityType;
  entityId: Identifier;
  onClose: () => void;
}) => {
  const translate = useTranslate();
  const refresh = useRefresh();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const [locale] = useLocaleState();
  const language = asEmailLanguage(locale);
  const isQuote = entityType === "quote";

  const [toEmail, setToEmail] = useState("");
  const [templateId, setTemplateId] = useState<Identifier | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tab, setTab] = useState("write");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [isPrefilled, setIsPrefilled] = useState(false);
  const [sent, setSent] = useState<EmailMessage | null>(null);

  const { data: context, error: contextError } = useQuery({
    queryKey: ["email", "context", entityType, entityId],
    queryFn: () => dataProvider.getEmailContext(entityType, entityId),
    enabled: open,
    // Who may be written to and what may be shared can change between two
    // openings of this dialog: always asked again.
    staleTime: 0,
    gcTime: 0,
  });

  const { data: allTemplates } = useGetList<EmailTemplate>(
    "email_templates",
    {
      filter: { is_active: true },
      sort: { field: "name", order: "ASC" },
      pagination: TEMPLATES_PAGE,
    },
    { enabled: open },
  );
  const templates = useMemo(
    () => templatesFor(allTemplates ?? [], entityType),
    [allTemplates, entityType],
  );
  // An installation that never saved its name in Settings still has one: the
  // title this screen is branded with.
  const { title } = useConfigurationContext();
  const variables = useMemo(
    () => ({
      ...context?.variables,
      issuer_name: context?.variables.issuer_name || title,
    }),
    [context, title],
  );

  // A fresh message each time the dialog opens: its own idempotency key, so a
  // double click is one message and two openings are two.
  useEffect(() => {
    if (!open) return;
    setToEmail("");
    setTemplateId(null);
    setSubject("");
    setBody("");
    setTab("write");
    setSent(null);
    setIsPrefilled(false);
    setIdempotencyKey(crypto.randomUUID());
  }, [open]);

  const applyTemplate = (template: EmailTemplate | undefined) => {
    setTemplateId(template?.id ?? null);
    if (!template || !context) return;
    setSubject(fillTemplate(template.subject, variables, language));
    setBody(fillTemplate(template.body, variables, language));
  };

  // Once the record's context and the templates are both in: the first
  // address on file and, for a quotation, its template.
  useEffect(() => {
    if (!open || isPrefilled || !context || allTemplates == null) return;
    setIsPrefilled(true);
    setToEmail(
      context.recipients.find((recipient) => !recipient.is_suppressed)?.email ??
        "",
    );
    const initial = defaultTemplate(templates, entityType, language);
    if (initial) {
      setTemplateId(initial.id);
      setSubject(fillTemplate(initial.subject, variables, language));
      setBody(fillTemplate(initial.body, variables, language));
    }
  }, [
    open,
    isPrefilled,
    context,
    allTemplates,
    templates,
    entityType,
    language,
    variables,
  ]);

  const {
    mutate: send,
    isPending,
    error: sendError,
    reset: resetSend,
  } = useMutation({
    mutationFn: (confirmDuplicate: boolean) =>
      dataProvider.sendEmail({
        entityType,
        entityId,
        quoteVersionId: context?.quote?.version_id ?? null,
        toEmail: toEmail.trim(),
        toName:
          context?.recipients.find(
            (recipient) => recipient.email === toEmail.trim().toLowerCase(),
          )?.name ?? null,
        subject,
        body,
        templateId,
        language,
        idempotencyKey,
        confirmDuplicate,
      }),
    onSuccess: (message) => {
      setSent(message);
      refresh();
    },
  });

  const status = context?.status;
  const block = context?.quote?.block ?? null;
  const stray = unresolvedVariables(subject, body, isQuote);
  const isDuplicate =
    sendError instanceof EmailRpcError &&
    sendError.key === EMAIL_ERROR.duplicateRecent;
  const canSend =
    context != null &&
    status?.is_ready === true &&
    block == null &&
    EMAIL_PATTERN.test(toEmail.trim()) &&
    subject.trim() !== "" &&
    body.trim() !== "" &&
    stray.length === 0 &&
    !isPending;

  const edit = <T,>(setter: (value: T) => void) => {
    return (value: T) => {
      setter(value);
      if (sendError) resetSend();
    };
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate(
              isQuote
                ? "crm.email.compose.title_quote"
                : "crm.email.compose.title",
            )}
          </DialogTitle>
          <DialogDescription>
            {isQuote && context?.quote?.version_number != null
              ? translate("crm.email.compose.description_quote", {
                  version: context.quote.version_number,
                })
              : translate("crm.email.compose.description")}
          </DialogDescription>
        </DialogHeader>

        {contextError ? (
          <p role="alert" className="text-sm text-destructive">
            {translate(emailErrorMessage(contextError))}
          </p>
        ) : !context ? (
          <Skeleton className="h-64 w-full" />
        ) : sent ? (
          <div className="flex flex-col gap-3 text-sm" role="status">
            <div className="flex items-center gap-2">
              <EmailStatusBadge status={sent.status} />
              <span>{sent.to_email}</span>
            </div>
            <p className="text-muted-foreground">
              {translate(`crm.email.result.${sent.status}`)}
            </p>
            {sent.error_code ? (
              <p className="text-destructive">
                {translate(`crm.email.delivery_errors.${sent.error_code}`, {
                  _: sent.error ?? sent.error_code,
                })}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {status?.is_simulated ? (
              <p className="flex gap-2 rounded-md border border-warning/40 bg-warning-tint p-3 text-sm">
                <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
                {translate("crm.email.compose.simulated_notice")}
              </p>
            ) : null}

            {status?.is_ready === false || block != null ? (
              <p
                role="alert"
                className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
              >
                <CircleAlert
                  className="size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                {translate(
                  block != null
                    ? `crm.email.quote_block.${block}`
                    : "crm.email.compose.not_ready",
                )}
              </p>
            ) : null}

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="write">
                  {translate("crm.email.compose.write")}
                </TabsTrigger>
                <TabsTrigger value="preview">
                  {translate("crm.email.compose.preview")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="write">
                <EmailComposeFields
                  recipients={context.recipients}
                  canSendAny={status?.can_send_any === true}
                  templates={templates}
                  toEmail={toEmail}
                  templateId={templateId}
                  subject={subject}
                  body={body}
                  stray={stray}
                  isQuote={isQuote}
                  disabled={isPending}
                  onToEmail={edit(setToEmail)}
                  onTemplate={(id) =>
                    applyTemplate(
                      templates.find(
                        (template) => String(template.id) === String(id),
                      ),
                    )
                  }
                  onSubject={edit(setSubject)}
                  onBody={edit(setBody)}
                />
              </TabsContent>
              <TabsContent value="preview">
                <EmailPreview
                  subject={subject}
                  body={body}
                  language={language}
                  variables={variables}
                  toEmail={toEmail}
                  isQuote={isQuote}
                />
              </TabsContent>
            </Tabs>

            {sendError ? (
              <p role="alert" className="text-sm text-destructive">
                {translate(emailErrorMessage(sendError))}
              </p>
            ) : null}
          </>
        )}

        <DialogFooter>
          {sent ? (
            <Button onClick={onClose}>{translate("ra.action.close")}</Button>
          ) : (
            <>
              <Button variant="outline" disabled={isPending} onClick={onClose}>
                {translate("ra.action.cancel")}
              </Button>
              {isDuplicate ? (
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() => send(true)}
                >
                  {translate("crm.email.compose.send_anyway")}
                </Button>
              ) : (
                <Button disabled={!canSend} onClick={() => send(false)}>
                  {translate(
                    isPending
                      ? "crm.email.compose.sending"
                      : "crm.email.compose.send",
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
