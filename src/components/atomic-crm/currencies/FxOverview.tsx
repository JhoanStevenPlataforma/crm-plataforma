import { useCanAccess, useLocaleState, useTranslate } from "ra-core";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { ProviderStatusBadge, ToneBadge } from "./FxBadges";
import { formatInstant } from "./fxFormat";
import {
  useCurrencies,
  useCurrentRates,
  useFxSettings,
  useRateProviders,
} from "./useFx";
import { useFxHealth, worstStatus } from "./useFxHealth";

const Tile = ({
  label,
  children,
  help,
}: {
  label: string;
  children: React.ReactNode;
  help?: string;
}) => (
  <Card className="gap-1 py-4">
    <CardContent className="flex flex-col gap-1 px-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="text-base font-semibold break-words tabular-nums">
        {children}
      </div>
      {help ? (
        <span className="text-xs text-muted-foreground">{help}</span>
      ) : null}
    </CardContent>
  </Card>
);

/**
 * The main panel: the base currency, when rates were last fetched, which
 * provider is active, the state of the connection and how many currencies
 * are active. A stale rate is called out here, not only in its table.
 */
export const FxOverview = ({
  onNavigate,
}: {
  onNavigate: (tab: string) => void;
}) => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const { base, active, isPending } = useCurrencies();
  const { rates } = useCurrentRates();
  const { providers } = useRateProviders();
  const { settings } = useFxSettings();
  const { canAccess: canSeeHealth } = useCanAccess({
    resource: "fx_health",
    action: "list",
  });
  const health = useFxHealth(canSeeHealth === true);

  if (isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  const lastFetched = rates
    .map((rate) => rate.official_fetched_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const activeProvider = providers.find((provider) => provider.is_enabled);
  const stale = rates.filter(
    (rate) => rate.is_active && rate.official_is_stale,
  ).length;
  const connection = health.data
    ? worstStatus(health.data.providers.map((provider) => provider.status))
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile
          label={translate("crm.fx.overview.base_currency")}
          help={translate("crm.fx.overview.base_help")}
        >
          {base ? `${base.code} · ${base.name}` : "—"}
        </Tile>
        <Tile label={translate("crm.fx.overview.last_update")}>
          {lastFetched
            ? formatInstant(lastFetched, locale)
            : translate("crm.fx.overview.never")}
        </Tile>
        <Tile label={translate("crm.fx.overview.active_provider")}>
          {activeProvider?.name ?? translate("crm.fx.overview.none")}
        </Tile>
        <Tile label={translate("crm.fx.overview.connection")}>
          {connection ? (
            <ProviderStatusBadge status={connection} />
          ) : health.isError ? (
            <span className="text-sm font-normal text-muted-foreground">
              {translate("crm.fx.demo_unavailable")}
            </span>
          ) : activeProvider?.last_success_at ? (
            <span className="text-sm font-normal">
              {formatInstant(activeProvider.last_success_at, locale)}
            </span>
          ) : (
            "—"
          )}
        </Tile>
        <Tile label={translate("crm.fx.overview.active_currencies")}>
          {active.length}
        </Tile>
      </div>

      {stale > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-tint px-4 py-3 text-sm text-warning">
          <span>
            {translate("crm.fx.overview.stale_warning", {
              count: stale,
              days: settings?.stale_after_days ?? 3,
            })}
          </span>
          <ToneBadge tone="warn">{translate("crm.fx.status.stale")}</ToneBadge>
        </div>
      ) : null}

      {canSeeHealth ? (
        <div>
          <Button variant="outline" onClick={() => onNavigate("health")}>
            {translate("crm.fx.overview.see_health")}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
