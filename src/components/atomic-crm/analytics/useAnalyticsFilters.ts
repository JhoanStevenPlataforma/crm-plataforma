import { useMemo } from "react";
import { useSearchParams } from "react-router";

import {
  parseAnalyticsFilters,
  type AnalyticsFilters,
} from "./analyticsFilters";

/**
 * The filters, parsed from the URL once per navigation.
 *
 * Memoised on the serialised query string rather than on the `URLSearchParams`
 * object, which is a new instance on every render: the parsed object is part of
 * a react-query key, so a fresh identity each render would refetch all the
 * aggregates whenever anything else on the page re-rendered.
 *
 * Its own module rather than a second export from `AnalyticsLayout`, so that
 * file exports only a component and fast refresh keeps working.
 */
export const useAnalyticsFilters = (): AnalyticsFilters => {
  const [searchParams] = useSearchParams();
  const serialised = searchParams.toString();

  return useMemo(
    () => parseAnalyticsFilters(new URLSearchParams(serialised)),
    [serialised],
  );
};
