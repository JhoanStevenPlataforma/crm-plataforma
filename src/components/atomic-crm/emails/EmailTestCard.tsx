import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useDataProvider, useLocaleState, useTranslate } from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { emailErrorMessage } from "../providers/commons/emailRpc";
import type { CrmDataProvider } from "../providers/types";
import { EmailStatusBadge } from "./EmailStatusBadge";
import { asEmailLanguage } from "./emailTemplate";

/**
 * A test message, to an address the administrator types: the way to find out
 * whether the configuration above actually sends, and what the provider
 * answers when it does not. It goes through the same queue and the same
 * dispatcher as every other message, and it is in the history like them.
 */
export const EmailTestCard = () => {
  const translate = useTranslate();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const [locale] = useLocaleState();
  const [toEmail, setToEmail] = useState("");

  const {
    mutate: sendTest,
    data: sent,
    error,
    isPending,
  } = useMutation({
    mutationFn: () =>
      dataProvider.sendEmail({
        entityType: null,
        entityId: null,
        toEmail: toEmail.trim(),
        subject: translate("crm.email.settings.test_subject"),
        body: translate("crm.email.settings.test_body"),
        language: asEmailLanguage(locale),
        // A test is a new message every time it is asked for.
        idempotencyKey: crypto.randomUUID(),
        confirmDuplicate: true,
      }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate("crm.email.settings.test_title")}</CardTitle>
        <CardDescription>
          {translate("crm.email.settings.test_help")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Label htmlFor="email-test-to">
          {translate("crm.email.fields.to")}
        </Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="email-test-to"
            type="email"
            autoComplete="off"
            className="min-w-0 flex-1"
            value={toEmail}
            onChange={(event) => setToEmail(event.target.value)}
          />
          <Button
            disabled={isPending || toEmail.trim() === ""}
            onClick={() => sendTest()}
          >
            {translate("crm.email.settings.test_send")}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {translate(emailErrorMessage(error))}
          </p>
        ) : sent ? (
          <div className="flex flex-col gap-1 text-sm" role="status">
            <div className="flex items-center gap-2">
              <EmailStatusBadge status={sent.status} />
              <span>{sent.to_email}</span>
            </div>
            <span className="text-muted-foreground">
              {translate(`crm.email.result.${sent.status}`)}
            </span>
            {sent.error_code ? (
              <span className="text-destructive">
                {translate(`crm.email.delivery_errors.${sent.error_code}`, {
                  _: sent.error ?? sent.error_code,
                })}
              </span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
