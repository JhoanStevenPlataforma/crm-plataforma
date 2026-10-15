import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "ra-core";

import type { CrmDataProvider } from "../providers/types";
import type { FxProviderStatus } from "../types";

export const FX_HEALTH_QUERY_KEY = ["fx", "health"] as const;

/**
 * `fx_integration_health()`: read from the database only -- opening the panel
 * never calls a provider. Refreshed every minute while the page is visible
 * (react-query pauses the interval in a background tab).
 */
export const useFxHealth = (enabled = true) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  return useQuery({
    queryKey: FX_HEALTH_QUERY_KEY,
    queryFn: () => dataProvider.getFxIntegrationHealth(),
    enabled,
    refetchInterval: 60_000,
    retry: false,
  });
};

const SEVERITY: Record<FxProviderStatus, number> = {
  operational: 0,
  disabled: 1,
  degraded: 2,
  down: 3,
};

/** The worst status among the ENABLED providers, or null when none is. */
export const worstStatus = (
  statuses: FxProviderStatus[],
): FxProviderStatus | null => {
  const enabled = statuses.filter((status) => status !== "disabled");
  if (enabled.length === 0) return null;
  return enabled.reduce((worst, status) =>
    SEVERITY[status] > SEVERITY[worst] ? status : worst,
  );
};
