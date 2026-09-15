import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "ra-core";

import type { CrmDataProvider } from "../providers/types";
import type { ReportCatalog, ReportResult, ReportSpec } from "../types";
import { specToRpcParams } from "./reportSpec";

/**
 * The catalogue, fetched once per session.
 *
 * It only changes when a migration ships, so a long `staleTime` is not a
 * trade-off — refetching it on every tab focus would cost a round trip to learn
 * nothing. Everything in the builder depends on it, so it is the one query the
 * module waits on before rendering anything.
 */
export const useReportCatalog = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();

  return useQuery<ReportCatalog>({
    queryKey: ["report-catalog"],
    queryFn: () => dataProvider.getReportCatalog(),
    staleTime: 60 * 60_000,
  });
};

/**
 * One report run, cached by its resolved parameters.
 *
 * Keyed on the RPC parameters rather than on the spec, so two specs that
 * resolve to the same query share a cache entry — which is what happens every
 * time a user switches the visualisation, since drawing a table instead of bars
 * changes nothing about the question.
 *
 * `enabled` is the guard that keeps a half-built report from being sent: the
 * builder validates against the catalogue first, and an invalid spec renders
 * its own message instead of a failed request.
 */
export const useReportQuery = (
  spec: ReportSpec | null,
  options: { enabled?: boolean; range?: { from: string; to: string } } = {},
) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const params = spec ? specToRpcParams(spec, new Date(), options.range) : null;

  return useQuery<ReportResult>({
    queryKey: ["report-run", params],
    queryFn: () => dataProvider.runReport(params as Record<string, unknown>),
    enabled: Boolean(params) && options.enabled !== false,
    staleTime: 60_000,
  });
};
