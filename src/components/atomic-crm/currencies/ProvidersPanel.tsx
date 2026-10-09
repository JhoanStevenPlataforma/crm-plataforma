import { RefreshCw } from "lucide-react";
import { useCanAccess, useLocaleState, useTranslate } from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SectionCard } from "../misc/SectionCard";
import type { ExchangeRateProvider } from "../types";
import { ToneBadge } from "./FxBadges";
import { formatInstant } from "./fxFormat";
import { CredentialsDialog, ProviderDialog } from "./ProviderDialogs";
import { useCurrencies, useRateProviders } from "./useFx";
import { useSyncNow } from "./useSyncNow";

/**
 * Where the rates come from. Admins tune each provider (on/off, priority,
 * frequency, currencies), store its credentials in the vault and force a
 * sync; managers read. Adding a provider is code plus a migration row, so
 * there is no "new provider" button.
 */
export const ProvidersPanel = () => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const { providers, refetch } = useRateProviders();
  const { currencies } = useCurrencies();
  const { canAccess: canEdit } = useCanAccess({
    resource: "exchange_rate_providers",
    action: "edit",
  });
  const sync = useSyncNow();
  const [editing, setEditing] = useState<ExchangeRateProvider | null>(null);
  const [credentials, setCredentials] = useState<ExchangeRateProvider | null>(
    null,
  );

  return (
    <SectionCard
      title={translate("crm.fx.tabs.providers")}
      contentClassName="p-0"
      action={
        canEdit ? (
          <Button
            size="sm"
            variant="outline"
            disabled={sync.isPending}
            onClick={() => sync.mutate({})}
          >
            <RefreshCw
              className={sync.isPending ? "animate-spin" : undefined}
            />
            {translate("crm.fx.providers.sync_all")}
          </Button>
        ) : undefined
      }
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{translate("crm.fx.providers.name")}</TableHead>
              <TableHead>{translate("crm.fx.providers.enabled")}</TableHead>
              <TableHead className="text-right">
                {translate("crm.fx.providers.priority")}
              </TableHead>
              <TableHead className="text-right">
                {translate("crm.fx.providers.frequency")}
              </TableHead>
              <TableHead>{translate("crm.fx.providers.currencies")}</TableHead>
              <TableHead>{translate("crm.fx.providers.credentials")}</TableHead>
              <TableHead>{translate("crm.fx.health.last_success")}</TableHead>
              {canEdit ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => (
              <TableRow key={provider.key}>
                <TableCell>
                  <div className="font-medium">{provider.name}</div>
                  <div className="max-w-xs text-xs text-muted-foreground">
                    {provider.description}
                  </div>
                </TableCell>
                <TableCell>
                  <ToneBadge tone={provider.is_enabled ? "good" : "neutral"}>
                    {translate(
                      provider.is_enabled
                        ? "crm.fx.status.active"
                        : "crm.fx.status.disabled",
                    )}
                  </ToneBadge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {provider.priority}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {provider.refresh_interval_minutes}
                </TableCell>
                <TableCell>{(provider.currencies ?? []).join(", ")}</TableCell>
                <TableCell>
                  {!provider.requires_credentials ? (
                    <span className="text-sm text-muted-foreground">
                      {translate("crm.fx.providers.credentials_none")}
                    </span>
                  ) : (
                    <ToneBadge
                      tone={provider.credentials_secret_id ? "good" : "warn"}
                    >
                      {translate(
                        provider.credentials_secret_id
                          ? "crm.fx.providers.credentials_set"
                          : "crm.fx.providers.credentials_missing",
                      )}
                    </ToneBadge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {provider.last_success_at
                    ? formatInstant(provider.last_success_at, locale)
                    : translate("crm.fx.health.never")}
                </TableCell>
                {canEdit ? (
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={sync.isPending || !provider.is_enabled}
                        onClick={() => sync.mutate({ provider: provider.key })}
                      >
                        {translate("crm.fx.providers.sync_now")}
                      </Button>
                      {provider.requires_credentials ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setCredentials(provider)}
                        >
                          {translate("crm.fx.providers.set_credentials")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(provider)}
                      >
                        {translate("crm.fx.providers.edit")}
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ProviderDialog
        provider={editing}
        currencies={currencies}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refetch();
        }}
      />
      <CredentialsDialog
        provider={credentials}
        onClose={() => setCredentials(null)}
        onSaved={() => {
          setCredentials(null);
          refetch();
        }}
      />
    </SectionCard>
  );
};
