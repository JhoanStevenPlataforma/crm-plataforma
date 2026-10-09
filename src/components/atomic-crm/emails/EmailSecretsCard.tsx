import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useNotify, useTranslate } from "ra-core";

import { Badge } from "@/components/ui/badge";
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
import { useEmailStatus } from "./useEmailStatus";

type SecretKind = "credentials" | "webhook";

/**
 * One secret: write-only. It goes straight to the server's vault through
 * `set_email_provider_secret()` and nothing ever reads it back into a
 * browser, so the field always starts empty and all the screen knows is
 * whether one is stored.
 */
const SecretRow = ({
  kind,
  isStored,
}: {
  kind: SecretKind;
  isStored: boolean;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const [secret, setSecret] = useState("");

  const { mutate: store, isPending } = useMutation({
    mutationFn: (value: string) =>
      dataProvider.setEmailProviderSecret(kind, value),
    onSuccess: (_data, value) => {
      notify(
        value
          ? "crm.email.settings.secret_saved"
          : "crm.email.settings.secret_cleared",
      );
      queryClient.invalidateQueries({ queryKey: ["email", "status"] });
    },
    onError: (error) =>
      notify(
        error instanceof Error && error.message.startsWith("crm.")
          ? error.message
          : emailErrorMessage(error),
        { type: "error" },
      ),
    // Whatever happened, the value does not stay in the page.
    onSettled: () => setSecret(""),
  });

  const inputId = `email-secret-${kind}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={inputId}>
          {translate(`crm.email.settings.secrets.${kind}`)}
        </Label>
        <Badge variant="outline" className="font-normal">
          {translate(
            isStored
              ? "crm.email.settings.secret_stored"
              : "crm.email.settings.secret_missing",
          )}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          className="min-w-0 flex-1"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />
        <Button
          disabled={isPending || secret.trim() === ""}
          onClick={() => store(secret)}
        >
          {translate("ra.action.save")}
        </Button>
        {isStored ? (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => store("")}
          >
            {translate("crm.email.settings.secret_clear")}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(`crm.email.settings.secrets_help.${kind}`)}
      </p>
    </div>
  );
};

export const EmailSecretsCard = () => {
  const translate = useTranslate();
  const { data: status } = useEmailStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate("crm.email.settings.secrets_title")}</CardTitle>
        <CardDescription>
          {translate("crm.email.settings.secrets_description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SecretRow
          kind="credentials"
          isStored={status?.has_credentials === true}
        />
        <SecretRow
          kind="webhook"
          isStored={status?.has_webhook_secret === true}
        />
      </CardContent>
    </Card>
  );
};
