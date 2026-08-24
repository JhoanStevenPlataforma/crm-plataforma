import { useMemo } from "react";
import {
  type Identifier,
  useGetIdentity,
  useGetList,
  useTimeout,
  useTranslate,
} from "ra-core";
import { useIsMobile } from "@/hooks/use-mobile";

import { TaskBucketSection } from "./TaskBucketSection";
import {
  buildBucketFilter,
  buildRecentlyDoneFilter,
  hasThisWeekBucket,
  OPEN_TASK_FILTER,
  type TaskBucketKey,
} from "./taskBuckets";

/**
 * The due-date task list (proposal §1.5, §15.2).
 *
 * The vocabulary — overdue / today / tomorrow / this week / later — is the part
 * of the original UX worth keeping. What changed is where it is computed: every
 * bucket is now a filtered, paginated, indexed query instead of a 1000-row
 * client-side fetch that was silently wrong past row 1000.
 *
 * The default scope also changed, and it is the delegation fix made visible:
 * "my work" now means the tasks I OWN (`owner_sales_id`), so a task somebody
 * assigned to me shows up in my list. It used to filter on `sales_id` — the
 * creator — which meant delegated work was invisible to the person supposed to
 * do it.
 */
export const TasksListByDueDate = ({
  filterByContact,
  entityFilter,
  showContact: showContactProp,
  emptyPlaceholder,
  pendingPlaceholder,
}: {
  filterByContact?: Identifier;
  /** Scope the list to any linked record (§14), e.g. `{ contact_id: 12 }`. */
  entityFilter?: Record<string, unknown>;
  showContact?: boolean;
  emptyPlaceholder?: React.ReactNode;
  pendingPlaceholder?: React.ReactNode;
}) => {
  const { identity } = useGetIdentity();
  const isMobile = useIsMobile();
  const translate = useTranslate();

  // Pinned once per mount: a fresh `new Date()` on every render would build a
  // new filter object each time and refetch every bucket in a loop.
  const now = useMemo(() => new Date(), []);

  const isScopedToEntity = entityFilter != null || filterByContact != null;
  const showContact = showContactProp ?? !isScopedToEntity;

  const scopeFilter = useMemo(() => {
    if (entityFilter) return entityFilter;
    if (filterByContact != null) return { contact_id: filterByContact };
    return { owner_sales_id: identity?.id };
  }, [entityFilter, filterByContact, identity?.id]);

  const enabled = isScopedToEntity ? true : !!identity;

  const bucketFilters = useMemo(() => {
    const keys: TaskBucketKey[] = [
      "overdue",
      "today",
      "tomorrow",
      ...(hasThisWeekBucket(now) ? (["this_week"] as TaskBucketKey[]) : []),
      "later",
      "no_due_date",
    ];

    return keys.map((key) => ({
      key,
      filter: { ...buildBucketFilter(key, now), ...scopeFilter },
    }));
  }, [now, scopeFilter]);

  const recentlyDoneFilter = useMemo(
    () => ({ ...buildRecentlyDoneFilter(now), ...scopeFilter }),
    [now, scopeFilter],
  );

  // A one-row probe: is there any open work at all in this scope? Cheaper than
  // waiting for six sections to report emptiness, and it is what decides
  // between the placeholder and the list.
  const { data: probe, isPending } = useGetList(
    "tasks",
    {
      pagination: { page: 1, perPage: 1 },
      sort: { field: "due_date", order: "ASC" },
      filter: { ...OPEN_TASK_FILTER, ...scopeFilter },
    },
    { enabled },
  );

  const oneSecondHasPassed = useTimeout(1000);
  const perPage = isMobile ? 10 : 5;

  if (isPending) {
    return oneSecondHasPassed ? (pendingPlaceholder ?? null) : null;
  }

  return (
    <div className="flex flex-col gap-4">
      {probe?.length === 0 && (emptyPlaceholder ?? null)}

      {bucketFilters.map(({ key, filter }) => (
        <TaskBucketSection
          key={key}
          title={translate(`resources.tasks.filters.${key}`)}
          filter={filter}
          showContact={showContact}
          perPage={perPage}
          enabled={enabled}
        />
      ))}

      <TaskBucketSection
        title={translate("resources.tasks.filters.recently_done")}
        filter={recentlyDoneFilter}
        showContact={showContact}
        perPage={perPage}
        enabled={enabled}
      />
    </div>
  );
};
