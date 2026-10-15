import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useNotify } from "ra-core";

import type { CrmDataProvider } from "../providers/types";
import type { FxSyncRequest } from "../providers/supabase/fxMethods";
import { FX_HEALTH_QUERY_KEY } from "./useFxHealth";

/**
 * "Sync now" (admins): calls the providers through the edge function, then
 * refreshes everything that reads the rates. The server refuses a second run
 * of a provider while one is running, so a double click cannot double-fetch.
 */
export const useSyncNow = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: FxSyncRequest = {}) =>
      dataProvider.syncExchangeRatesNow(request),
    onSuccess: (outcomes) => {
      const count = (status: string) =>
        outcomes.filter((outcome) => outcome.status === status).length;
      notify("crm.fx.health.sync_result", {
        type: count("failed") > 0 ? "warning" : "info",
        messageArgs: {
          succeeded: count("succeeded"),
          failed: count("failed"),
          skipped: count("skipped"),
        },
      });
    },
    onError: (error) =>
      notify(
        error instanceof Error && error.message.startsWith("crm.")
          ? error.message
          : "crm.fx.health.sync_error",
        { type: "error" },
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FX_HEALTH_QUERY_KEY });
      for (const resource of [
        "current_exchange_rates",
        "exchange_rates",
        "exchange_rate_providers",
        "exchange_rate_sync_runs",
      ]) {
        queryClient.invalidateQueries({ queryKey: [resource] });
      }
    },
  });
};
