import { useState } from "react";
import { useTranslate, type Identifier } from "ra-core";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { EmailRecipient, EmailTemplate } from "../types";

const OTHER = "__other__";
const NO_TEMPLATE = "__none__";

/**
 * The fields of a message: to whom, from which template, the subject, the
 * text. Presentational -- the dialog owns the values.
 *
 * The recipient is CHOSEN among the record's addresses. Typing another one is
 * offered only to whoever `email_context()` says may (`canSendAny`); the server
 * refuses it from anybody else whatever this renders.
 */
export const EmailComposeFields = ({
  recipients,
  canSendAny,
  templates,
  toEmail,
  templateId,
  subject,
  body,
  stray,
  isQuote,
  disabled,
  onToEmail,
  onTemplate,
  onSubject,
  onBody,
}: {
  recipients: EmailRecipient[];
  canSendAny: boolean;
  templates: EmailTemplate[];
  toEmail: string;
  templateId: Identifier | null;
  subject: string;
  body: string;
  /** Variables still unfilled, which the server would refuse. */
  stray: string[];
  isQuote: boolean;
  disabled?: boolean;
  onToEmail: (value: string) => void;
  onTemplate: (id: string | null) => void;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
}) => {
  const translate = useTranslate();
  const isKnown = recipients.some((recipient) => recipient.email === toEmail);
  const [isTyping, setIsTyping] = useState(false);
  const showFreeInput = canSendAny && (isTyping || recipients.length === 0);

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email-to">{translate("crm.email.fields.to")}</Label>
        {recipients.length > 0 ? (
          <Select
            value={showFreeInput ? OTHER : isKnown ? toEmail : ""}
            disabled={disabled}
            onValueChange={(value) => {
              if (value === OTHER) {
                setIsTyping(true);
                onToEmail("");
              } else {
                setIsTyping(false);
                onToEmail(value);
              }
            }}
          >
            <SelectTrigger id="email-to" className="w-full">
              <SelectValue
                placeholder={translate("crm.email.compose.to_placeholder")}
              />
            </SelectTrigger>
            <SelectContent>
              {recipients.map((recipient) => (
                <SelectItem
                  key={recipient.email}
                  value={recipient.email}
                  // Not offered: the server would refuse it, and says why.
                  disabled={recipient.is_suppressed === true}
                >
                  {recipient.name
                    ? `${recipient.name} <${recipient.email}>`
                    : recipient.email}
                  {recipient.is_suppressed
                    ? ` (${translate("crm.email.compose.suppressed")})`
                    : null}
                </SelectItem>
              ))}
              {canSendAny ? (
                <SelectItem value={OTHER}>
                  {translate("crm.email.compose.other_address")}
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        ) : !canSendAny ? (
          <p className="text-sm text-muted-foreground">
            {translate("crm.email.compose.no_recipients")}
          </p>
        ) : null}
        {showFreeInput ? (
          <Input
            id={recipients.length > 0 ? "email-to-other" : "email-to"}
            type="email"
            autoComplete="off"
            value={toEmail}
            disabled={disabled}
            aria-label={translate("crm.email.compose.other_address")}
            placeholder={translate("crm.email.compose.address_placeholder")}
            onChange={(event) => onToEmail(event.target.value)}
          />
        ) : null}
        {!canSendAny && recipients.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {translate("crm.email.compose.related_only")}
          </p>
        ) : null}
      </div>

      {templates.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="email-template">
            {translate("crm.email.fields.template")}
          </Label>
          <Select
            value={templateId == null ? NO_TEMPLATE : String(templateId)}
            disabled={disabled}
            onValueChange={(value) =>
              onTemplate(value === NO_TEMPLATE ? null : value)
            }
          >
            <SelectTrigger id="email-template" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEMPLATE}>
                {translate("crm.email.compose.no_template")}
              </SelectItem>
              {templates.map((template) => (
                <SelectItem key={template.id} value={String(template.id)}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email-subject">
          {translate("crm.email.fields.subject")}
        </Label>
        <Input
          id="email-subject"
          value={subject}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => onSubject(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email-body">{translate("crm.email.fields.body")}</Label>
        <Textarea
          id="email-body"
          value={body}
          rows={10}
          disabled={disabled}
          onChange={(event) => onBody(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {translate(
            isQuote
              ? "crm.email.compose.body_hint_quote"
              : "crm.email.compose.body_hint",
          )}
        </p>
        {stray.length > 0 ? (
          <p role="alert" className="text-xs text-destructive">
            {translate("crm.email.compose.unresolved", {
              variables: stray.map((name) => `{{${name}}}`).join(", "),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
};
