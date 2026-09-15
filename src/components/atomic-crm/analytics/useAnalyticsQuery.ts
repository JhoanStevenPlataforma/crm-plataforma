import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "ra-core";

import type { CrmDataProvider } from "../providers/types";
import type { AnalyticsFn } from "../types";

/**
 * One analytics RPC, cached by function and parameters.
 *
 * `staleTime` is a minute: these are reporting figures, not a live board, and
 * re-running eight aggregate queries every time a tab regains focus is a cost
 * with no reader-visible benefit. The key includes the whole parameter object,
 * so moving between tabs re-uses what is already cached and only the new tab's
 * functions are fetched.
 *
 * A tab fires two or three of these in parallel, which is one wall-clock round
 * trip. They run in separate transactions, so a total and a breakdown that must
 * reconcile exactly are returned by the SAME function rather than fetched
 * separately — otherwise a write landing between two requests makes them
 * disagree, and the total is what gets doubted.
 */
export const useAnalyticsQuery = <T>(
  fn: AnalyticsFn,
  params: Record<string, unknown>,
) => {
  const dataProvider = useDataProvider<CrmDataProvider>();

  return useQuery<T[]>({
    queryKey: ["analytics", fn, params],
    queryFn: () => dataProvider.getAnalytics<T>(fn, params),
    staleTime: 60_000,
  });
};
