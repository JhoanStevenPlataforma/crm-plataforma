import { ChevronDown, RotateCcw } from "lucide-react";
import {
  useInfinitePaginationContext,
  useListContext,
  useLocaleState,
  useTranslate,
} from "ra-core";

import { Spinner } from "@/components/admin/spinner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

import {
  COMPANY_CREATED,
  CONTACT_CREATED,
  CONTACT_NOTE_CREATED,
  DEAL_CREATED,
  DEAL_NOTE_CREATED,
} from "../consts";
import { InfinitePagination } from "../misc/InfinitePagination";
import type { Activity } from "../types";
import { ActivityLogCompanyCreated } from "./ActivityLogCompanyCreated";
import { ActivityLogContactCreated } from "./ActivityLogContactCreated";
import { ActivityLogContactNoteCreated } from "./ActivityLogContactNoteCreated";
import { ActivityLogDealCreated } from "./ActivityLogDealCreated";
import { ActivityLogDealNoteCreated } from "./ActivityLogDealNoteCreated";
import { formatDayLabel, groupByDay } from "./activityDays";

/**
 * The activity feed: a timeline grouped by day, newest first.
 *
 * The day heading carries the date, so each event only shows its time; a
 * page added by "load more" continues the last day's group when it spans the
 * page boundary, because grouping runs over the whole loaded list.
 */
export function ActivityLogIterator() {
  const isMobile = useIsMobile();
  const { data, isPending, error, refetch } = useListContext<Activity>();
  const { hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfinitePaginationContext();
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();

  if (isPending) return <ActivityLogSkeleton />;

  if (error && !data?.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          {translate("crm.dashboard.latest_activity_error", {
            _: "Error loading latest activity",
          })}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RotateCcw />
          {translate("crm.common.retry")}
        </Button>
      </div>
    );
  }

  const days = groupByDay(data ?? [], (activity) => activity.date);

  return (
    <div className="flex flex-col gap-5">
      {days.map((day) => (
        <section key={day.key} aria-label={formatDayLabel(day.date, locale)}>
          <h3 className="mb-3 flex items-center gap-3 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {formatDayLabel(day.date, locale)}
            <span aria-hidden className="h-px flex-1 bg-border/70" />
          </h3>
          <ol className="flex flex-col">
            {day.items.map((activity) => (
              <ActivityItem
                key={`${activity.type}-${activity.id}`}
                activity={activity}
              />
            ))}
          </ol>
        </section>
      ))}

      {/* Desktop: an explicit button, so the page never grows under the reader. */}
      {!isMobile && hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? <Spinner size="small" /> : <ChevronDown />}
          {translate("crm.activity.load_more")}
        </Button>
      ) : null}

      {/* Mobile: auto-load on scroll via IntersectionObserver */}
      {isMobile ? (
        <div className="flex justify-center">
          <InfinitePagination />
        </div>
      ) : null}
    </div>
  );
}

/** The timeline's own shape, so nothing jumps when the rows arrive. */
const ActivityLogSkeleton = () => (
  <div className="flex flex-col gap-5" aria-busy>
    <Skeleton className="h-3 w-20" />
    {Array.from({ length: 4 }).map((_, index) => (
      <div className="flex gap-3" key={index}>
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2 pt-1.5">
          <Skeleton className="h-3.5 w-3/4" />
          {index % 2 === 0 ? <Skeleton className="h-10 w-full" /> : null}
        </div>
      </div>
    ))}
  </div>
);

function ActivityItem({ activity }: { activity: Activity }) {
  if (activity.type === COMPANY_CREATED) {
    return <ActivityLogCompanyCreated activity={activity} />;
  }

  if (activity.type === CONTACT_CREATED) {
    return <ActivityLogContactCreated activity={activity} />;
  }

  if (activity.type === CONTACT_NOTE_CREATED) {
    return <ActivityLogContactNoteCreated activity={activity} />;
  }

  if (activity.type === DEAL_CREATED) {
    return <ActivityLogDealCreated activity={activity} />;
  }

  if (activity.type === DEAL_NOTE_CREATED) {
    return <ActivityLogDealNoteCreated activity={activity} />;
  }

  return null;
}
