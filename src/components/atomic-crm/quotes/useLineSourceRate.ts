import { useQuery } from "@tanstack/react-query";
import { useDataProvider, type Identifier } from "ra-core";

import type { CrmDataProvider } from "../providers/types";

/**
 * The rate a line from a list in `sourceCurrency` will be converted at in this
 * version, read from the backend's own resolution (`fx_line_source_rate()`),
 * so the picker previews exactly the figure the line is stored at. `revision`
 * re-reads it when the version's rate or its lines change (a new line may fix
 * the observation the next one reuses).
 */
export const useLineSourceRate = (
  versionId: Identifier | null | undefined,
  sourceCurrency: string | null | undefined,
  revision: string,
) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  return useQuery({
    queryKey: ["fx_line_source_rate", versionId, sourceCurrency, revision],
    queryFn: () => dataProvider.getLineSourceRate(versionId!, sourceCurrency!),
    enabled: versionId != null && sourceCurrency != null,
  });
};
