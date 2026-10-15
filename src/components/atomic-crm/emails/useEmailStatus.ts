import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "ra-core";

import type { CrmDataProvider } from "../providers/types";

/** Changes when an admin reconfigures the provider, which is rare. */
const STALE_MS = 5 * 60 * 1000;

/**
 * Whether mail can be sent, and whether it is only simulated: what decides if
 * a screen offers "Send email" at all. One query for every button on a page.
 */
export const useEmailStatus = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  return useQuery({
    queryKey: ["email", "status"],
    queryFn: () => dataProvider.getEmailStatus(),
    staleTime: STALE_MS,
  });
};
