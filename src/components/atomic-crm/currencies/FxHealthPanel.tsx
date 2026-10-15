import { RefreshCw } from "lucide-react";
import {
  useCanAccess,
  useGetList,
  useLocaleState,
  useTranslate,
} from "ra-core";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { SectionCard } from "../misc/SectionCard";
import type { FxProviderHealth } from "../types";
import { ProviderStatusBadge, ToneBadge } from "./FxBadges";
import { formatDay, formatInstant } from "./fxFormat";
import { FxSyncRuns } from "./FxSyncRuns";
import { useFxHealth } from "./useFxHealth";
import { useSyncNow } from "./useSyncNow";

const Row = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 text-sm last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right tabular-nums">{children}</span>
  </div>
);

/**
 * Integration health: what each rate provider did, read from the database
 * (`fx_integration_health()`), so opening it never calls a provider. The
 * status rule is the server's, pinned by pgTAP; this only draws it.
 */
export const FxHealthPanel = () => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const { data: health, isPending, isError, error } = useFxHealth();
  const { canAccess: canSync } = useCanAccess({
    resource: "exchange_rate_providers",
    action: "edit",
  });
  const sync = useSyncNow();
  // Ids of the providers, to label the runs table by name.
  const { data: providers = [] } = useGetList("exchange_rate_providers", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "priority", order: "ASC" },
  });

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (isError || !health) {
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        {error instanceof Error && error.message.startsWith("crm.")
          ? translate(error.message)
          : translate("crm.fx.errors.generic")}
      </p>
    );
  }

  const never = translate("crm.fx.health.never");
  const auto = health.auto_sync;
  const oldest = health.oldest_rate_in_use;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {translate("crm.fx.health.description")}
        </p>
        {canSync ? (
          <Button
            variant="outline"
            disabled={sync.isPending}
            onClick={() => sync.mutate({})}
          >
            <RefreshCw
              className={sync.isPending ? "animate-spin" : undefined}
            />
            {translate("crm.fx.providers.sync_all")}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {health.providers.map((provider) => (
          <ProviderCard
            key={provider.key}
            provider={provider}
            canSync={canSync === true}
            isSyncing={sync.isPending}
            onSync={() => sync.mutate({ provider: provider.key })}
            never={never}
            locale={locale}
          />
        ))}
      </div>

      <SectionCard title={translate("crm.fx.health.title")}>
        <Row label={translate("crm.fx.health.auto_sync")}>
          {auto.active ? (
            <ToneBadge tone="good">
              {translate("crm.fx.health.auto_active", {
                schedule: auto.schedule ?? "",
              })}
            </ToneBadge>
          ) : (
            <span className="flex flex-col items-end gap-1">
              <ToneBadge tone="bad">
                {translate("crm.fx.health.auto_inactive")}
              </ToneBadge>
              <span className="text-xs text-muted-foreground">
                {!auto.job_exists
                  ? translate("crm.fx.health.auto_missing_job")
                  : !auto.secrets_configured
                    ? translate("crm.fx.health.auto_missing_secrets")
                    : null}
              </span>
            </span>
          )}
        </Row>
        <Row label={translate("crm.fx.health.history")}>
          {health.history.available
            ? translate("crm.fx.health.history_value", {
                count: health.history.rates,
                from: formatDay(health.history.from, locale),
                to: formatDay(health.history.to, locale),
              })
            : translate("crm.fx.health.history_none")}
        </Row>
        <Row label={translate("crm.fx.health.oldest")}>
          {oldest ? (
            <span className="flex flex-col items-end gap-1">
              <span className={oldest.is_stale ? "text-warning" : undefined}>
                {translate("crm.fx.health.oldest_value", {
                  currency: oldest.currency,
                  kind: translate(`crm.fx.kinds.${oldest.kind}`, {
                    _: oldest.kind,
                  }),
                  date: formatDay(oldest.effective_date, locale),
                })}
              </span>
              {oldest.source === "draft_quote" && oldest.quote_id != null ? (
                <Link
                  to={`/quotes/${oldest.quote_id}/show`}
                  className="text-xs text-primary underline-offset-2 hover:underline"
                >
                  {translate("crm.fx.health.oldest_draft")}
                </Link>
              ) : null}
            </span>
          ) : (
            translate("crm.fx.health.oldest_none")
          )}
        </Row>
        <Row label={translate("crm.fx.overview.active_currencies")}>
          {health.active_currencies}
        </Row>
        <Row label={translate("crm.fx.health.without_rate")}>
          {health.currencies_without_rate.length > 0 ? (
            <ToneBadge tone="warn">
              {health.currencies_without_rate.join(", ")}
            </ToneBadge>
          ) : (
            "—"
          )}
        </Row>
      </SectionCard>

      <FxSyncRuns providers={providers} />
    </div>
  );
};

const ProviderCard = ({
  provider,
  canSync,
  isSyncing,
  onSync,
  never,
  locale,
}: {
  provider: FxProviderHealth;
  canSync: boolean;
  isSyncing: boolean;
  onSync: () => void;
  never: string;
  locale: string;
}) => {
  const translate = useTranslate();
  return (
    <Card className="gap-2 py-4">
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{provider.name}</h3>
            <span className="text-xs text-muted-foreground">
              {(provider.currencies ?? []).join(", ")}
            </span>
          </div>
          <ProviderStatusBadge status={provider.status} />
        </div>
        <div>
          <Row label={translate("crm.fx.health.last_attempt")}>
            {provider.last_attempt_at
              ? formatInstant(provider.last_attempt_at, locale)
              : never}
          </Row>
          <Row label={translate("crm.fx.health.last_success")}>
            {provider.last_success_at
              ? formatInstant(provider.last_success_at, locale)
              : never}
          </Row>
          <Row label={translate("crm.fx.health.imported_last")}>
            {provider.rates_imported_last_run ?? "—"}
          </Row>
          <Row label={translate("crm.fx.health.imported_30d")}>
            {provider.rates_imported_30d}
          </Row>
          <Row label={translate("crm.fx.health.errors")}>
            {provider.last_error ? (
              <Tooltip>
                <TooltipTrigger className="underline decoration-dotted underline-offset-2">
                  {translate("crm.fx.health.errors_value", {
                    errors: provider.errors_30d,
                    consecutive: provider.consecutive_failures,
                  })}
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  {translate("crm.fx.health.last_error")}: {provider.last_error}
                </TooltipContent>
              </Tooltip>
            ) : (
              translate("crm.fx.health.errors_value", {
                errors: provider.errors_30d,
                consecutive: provider.consecutive_failures,
              })
            )}
          </Row>
          <Row label={translate("crm.fx.health.history_from")}>
            {formatDay(provider.history_from, locale)}
          </Row>
        </div>
        {canSync ? (
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            disabled={isSyncing || provider.is_running || !provider.is_enabled}
            onClick={onSync}
          >
            <RefreshCw
              className={
                isSyncing || provider.is_running ? "animate-spin" : undefined
              }
            />
            {provider.is_running
              ? translate("crm.fx.status.running")
              : translate("crm.fx.providers.sync_now")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
};
