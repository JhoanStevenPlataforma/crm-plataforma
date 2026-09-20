import { useQueryClient } from "@tanstack/react-query";
import { useDataProvider, type Identifier } from "ra-core";
import { useEffect } from "react";

import type { CrmDataProvider } from "../providers/types";

/**
 * What a quote's page reads, and therefore what a change on the server makes
 * stale: the header and its counters (`quotes_summary`), the versions, the
 * thread and the links with their view counts.
 */
const QUOTE_PAGE_RESOURCES = [
  "quotes",
  "quote_versions",
  "quote_comments",
  "quote_access_tokens_summary",
];

/**
 * Keeps a quote's page current while it is open (quotes §6.5, D2): the
 * customer opening the link, writing, accepting or declining, and a colleague
 * moving or discussing the quote, all reach the rep without a reload.
 *
 * The data provider says THAT the quote changed and nothing more; the page
 * refetches what it reads, as it would on navigation. This hook only
 * invalidates React Query keys, so the screens stay ordinary `useGetList` /
 * `useGetOne` readers and work unchanged in demo mode, where nothing is ever
 * announced.
 *
 * A subscription that cannot be set up is not an error on the page: the quote
 * still refreshes after every write made here and on navigation.
 */
export const useQuoteRealtime = (quoteId: Identifier | undefined) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (quoteId == null) return;

    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    const onChange = () => {
      for (const resource of QUOTE_PAGE_RESOURCES) {
        void queryClient.invalidateQueries({ queryKey: [resource] });
      }
    };

    dataProvider.subscribeToQuoteChanges(quoteId, onChange).then(
      (stop) => {
        // Left before the subscription was up: stop it straight away.
        if (isActive) unsubscribe = stop;
        else stop();
      },
      () => {
        // No live updates; see above.
      },
    );

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, [dataProvider, queryClient, quoteId]);
};
