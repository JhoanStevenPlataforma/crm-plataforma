import { ArrowRight, Plus } from "lucide-react";
import { useGetIdentity, useGetList, useTranslate } from "ra-core";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { closedDealStages } from "../deals/pipelineFigures";
import { SectionCard } from "../misc/SectionCard";
import { useTeamScopeFilter } from "../misc/useTeamScopeFilter";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { nextTaskByEntity } from "../tasks/nextOpenTask";
import { OPEN_TASK_FILTER } from "../tasks/taskBuckets";
import type { Contact, Deal, Task } from "../types";
import { HotContactRow } from "./HotContactRow";
import { coolingCutoff, idList, openDealByContact } from "./hotContactSignals";

type HotFilter = "all" | "cooling" | "mine";

/** Enough to act on; the rest is one click away on the contact list. */
const ROWS = 6;
/** Deals or tasks for six contacts: far more than a page of them carries. */
const SIGNALS_PER_PAGE = 50;

/**
 * The contacts a rep marked "hot", ordered so the one going cold comes first.
 *
 * The list used to be sorted by most recent touch, which put the contact
 * nobody had called in a month at the bottom — the opposite of what the panel
 * is for. Each row carries its evidence (see `HotContactRow`), fetched for the
 * whole page in two queries: open deals through `contact_ids@ov`, and open
 * tasks through `primary_entity_id@in`.
 */
export const HotContacts = () => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const teamScope = useTeamScopeFilter();
  const { dealPipelineStatuses } = useConfigurationContext();
  const [filter, setFilter] = useState<HotFilter>("all");

  // Pinned per mount so the filters below are stable query keys.
  const now = useMemo(() => new Date(), []);
  const enabled = Number.isInteger(identity?.id);

  // A rep is already scoped to their own contacts, so "mine" would repeat
  // "all"; the chip is only offered to those who see everybody's.
  const canFilterMine = !("sales_id" in teamScope);

  const baseFilter = useMemo(
    () => ({ status: "hot", ...teamScope }),
    [teamScope],
  );
  const coolingFilter = useMemo(
    () => ({ ...baseFilter, "last_seen@lt": coolingCutoff(now) }),
    [baseFilter, now],
  );
  const listFilter =
    filter === "cooling"
      ? coolingFilter
      : filter === "mine"
        ? { ...baseFilter, sales_id: identity?.id }
        : baseFilter;

  const { total: allTotal } = useGetList<Contact>(
    "contacts",
    { pagination: { page: 1, perPage: 1 }, filter: baseFilter },
    { enabled },
  );
  const { total: coolingTotal } = useGetList<Contact>(
    "contacts",
    { pagination: { page: 1, perPage: 1 }, filter: coolingFilter },
    { enabled },
  );
  const { data: contacts, isPending } = useGetList<Contact>(
    "contacts",
    {
      pagination: { page: 1, perPage: ROWS },
      sort: { field: "last_seen", order: "ASC" },
      filter: listFilter,
    },
    { enabled },
  );

  const ids = contacts?.map((contact) => contact.id) ?? [];
  const hasRows = ids.length > 0;

  const { data: deals } = useGetList<Deal>(
    "deals",
    {
      pagination: { page: 1, perPage: SIGNALS_PER_PAGE },
      sort: { field: "amount", order: "DESC" },
      filter: {
        "contact_ids@ov": idList(ids, "{}"),
        "archived_at@is": null,
      },
    },
    { enabled: hasRows },
  );
  const { data: tasks } = useGetList<Task>(
    "tasks",
    {
      pagination: { page: 1, perPage: SIGNALS_PER_PAGE },
      sort: { field: "due_date", order: "ASC" },
      filter: {
        ...OPEN_TASK_FILTER,
        primary_entity_type: "contact",
        "primary_entity_id@in": idList(ids, "()"),
      },
    },
    { enabled: hasRows },
  );

  const dealsByContact = useMemo(
    () =>
      openDealByContact(deals ?? [], closedDealStages(dealPipelineStatuses)),
    [deals, dealPipelineStatuses],
  );
  const tasksByContact = useMemo(() => nextTaskByEntity(tasks ?? []), [tasks]);

  const listLink = `/contacts?filter=${encodeURIComponent(
    JSON.stringify({ status: "hot" }),
  )}`;

  return (
    <SectionCard
      title={translate("resources.contacts.hot.title")}
      subtitle={translate("resources.contacts.hot.subtitle")}
      action={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/contacts/create">
                <Plus className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {translate("resources.contacts.action.create")}
          </TooltipContent>
        </Tooltip>
      }
      contentClassName="p-0"
    >
      {allTotal === 0 ? (
        <div className="flex flex-col gap-2 p-4">
          <p className="text-sm">
            {translate("resources.contacts.hot.empty_hint")}
          </p>
          <p className="text-sm text-muted-foreground">
            {translate("resources.contacts.hot.empty_change_status")}
          </p>
        </div>
      ) : (
        <>
          <ToggleGroup
            type="single"
            value={filter}
            // Radix emits "" when the active chip is clicked again; keep the
            // current filter rather than leaving the list with none.
            onValueChange={(value) =>
              value ? setFilter(value as HotFilter) : undefined
            }
            aria-label={translate("resources.contacts.hot.filter_label")}
            className="flex-wrap justify-start gap-1.5 px-4 pt-3 pb-1"
          >
            <FilterChip value="all" count={allTotal}>
              {translate("resources.contacts.hot.filter_all")}
            </FilterChip>
            <FilterChip value="cooling" count={coolingTotal} warn>
              {translate("resources.contacts.hot.filter_cooling")}
            </FilterChip>
            {canFilterMine ? (
              <FilterChip value="mine">
                {translate("resources.contacts.hot.filter_mine")}
              </FilterChip>
            ) : null}
          </ToggleGroup>

          {isPending ? (
            <HotContactsSkeleton />
          ) : hasRows ? (
            <ul className="divide-y divide-border/70">
              {contacts?.map((contact) => (
                <HotContactRow
                  key={contact.id}
                  contact={contact}
                  deal={dealsByContact.get(contact.id)}
                  nextTask={tasksByContact.get(contact.id)}
                  now={now}
                />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {translate("resources.contacts.hot.empty_filter")}
            </p>
          )}

          <Link
            to={listLink}
            className="flex items-center justify-center gap-1.5 border-t border-border/70 px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            {translate("resources.contacts.hot.view_all", {
              total: allTotal ?? "",
            })}
            <ArrowRight className="size-3.5" />
          </Link>
        </>
      )}
    </SectionCard>
  );
};

const FilterChip = ({
  value,
  count,
  warn = false,
  children,
}: {
  value: HotFilter;
  count?: number;
  /** Tints the count when it is non-zero: those are the rows to act on. */
  warn?: boolean;
  children: string;
}) => (
  <ToggleGroupItem
    value={value}
    size="sm"
    className="h-7 flex-none rounded-full! border border-border px-2.5 text-xs text-muted-foreground data-[state=on]:border-brand/40 data-[state=on]:bg-brand-tint data-[state=on]:text-brand-strong"
  >
    {children}
    {count != null ? (
      <span
        className={
          warn && count > 0
            ? "font-semibold text-warning tabular-nums"
            : "tabular-nums opacity-70"
        }
      >
        {count}
      </span>
    ) : null}
  </ToggleGroupItem>
);

const HotContactsSkeleton = () => (
  <ul className="divide-y divide-border/70">
    {Array.from({ length: 4 }, (_, index) => (
      <li key={index} className="flex gap-3 px-4 py-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </li>
    ))}
  </ul>
);
