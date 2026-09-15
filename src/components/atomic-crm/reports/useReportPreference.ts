import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDataProvider } from "ra-core";

import type { CrmDataProvider } from "../providers/types";
import type { ReportSpec } from "../types";

/**
 * This user's saved view of a report they cannot edit.
 *
 * A built-in belongs to the installation and a shared report belongs to its
 * author, so neither accepts the reader's changes. Before this, adjusting one
 * and coming back lost the adjustment — or pushed a duplicate into the library
 * for what was really just "I prefer to see this by month".
 *
 * The report keeps its definition; the reader keeps their view of it. Deleting
 * the preference restores the original, which is what keeps the built-in
 * library's promise that every visualisation has a working example in it.
 */
export const useReportPreference = (reportId: number | null) => {
  const dataProvider = useDataProvider<CrmDataProvider>();

  return useQuery<ReportSpec | null>({
    queryKey: ["report-preference", reportId],
    queryFn: () => dataProvider.getReportPreference(reportId as number),
    enabled: reportId != null,
    // The preference is written from this same screen, so a refetch on focus
    // would race the debounced save and can only ever return what was just
    // sent. It is invalidated explicitly instead.
    staleTime: Infinity,
  });
};

/**
 * Saves and clears it.
 *
 * Both mutations invalidate the query rather than writing into the cache
 * optimistically: the spec on screen is already the source of truth for what
 * the user is looking at, so an optimistic update would be setting a value the
 * UI is not reading. The invalidation only matters for the NEXT visit.
 */
export const useReportPreferenceMutations = (reportId: number | null) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["report-preference", reportId],
    });

  const save = useMutation({
    mutationFn: ({ salesId, spec }: { salesId: number; spec: ReportSpec }) =>
      dataProvider.saveReportPreference(reportId as number, salesId, spec),
    onSuccess: invalidate,
  });

  const clear = useMutation({
    mutationFn: () => dataProvider.clearReportPreference(reportId as number),
    onSuccess: invalidate,
  });

  return { save, clear };
};
