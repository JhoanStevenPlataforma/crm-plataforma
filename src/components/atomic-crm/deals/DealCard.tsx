import { Draggable } from "@hello-pangea/dnd";
import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CalendarOff,
  CircleDashed,
  FileText,
  Receipt,
} from "lucide-react";
import {
  RecordContextProvider,
  useLocaleState,
  useRedirect,
  useTranslate,
} from "ra-core";
import type { ReactNode } from "react";
import { ReferenceField } from "@/components/admin/reference-field";
import { SelectField } from "@/components/admin/select-field";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { formatMoney } from "../misc/reporting";
import { calendarDaysBetween, formatRelativeDay } from "../misc/relativeTime";
import { QuoteStatusBadge } from "../quotes/QuoteStatusBadge";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal, Sale, Task } from "../types";
import { useDealBoardSignals } from "./DealBoardSignals";
import {
  closeDateStatus,
  closedDealStages,
  parseCalendarDate,
} from "./pipelineFigures";

export const DealCard = ({ deal, index }: { deal: Deal; index: number }) => {
  if (!deal) return null;

  return (
    <Draggable draggableId={String(deal.id)} index={index}>
      {(provided, snapshot) => (
        <DealCardContent provided={provided} snapshot={snapshot} deal={deal} />
      )}
    </Draggable>
  );
};

/**
 * A deal on the board: who, what, how much — then the two facts that decide
 * whether it needs attention today, drawn the way the pipeline boards reps
 * already know draw them:
 *
 * - the expected close date, red once it has passed (the forecast is wrong
 *   until someone re-dates the deal), amber inside a week;
 * - the activity indicator: green when the next task is scheduled, red when it
 *   is overdue, amber when nothing is scheduled at all — a deal nobody is
 *   working.
 *
 * Neither alarm applies to a decided deal (won, lost): there is nothing left to
 * chase. Outside the board (the archived list) the signals context is absent
 * and the card simply omits the owner and the activity.
 */
export const DealCardContent = ({
  provided,
  snapshot,
  deal,
}: {
  provided?: any;
  snapshot?: any;
  deal: Deal;
}) => {
  const { dealCategories, dealPipelineStatuses, currency } =
    useConfigurationContext();
  const signals = useDealBoardSignals();
  const redirect = useRedirect();
  const handleClick = () => {
    redirect(`/deals/${deal.id}/show`, undefined, undefined, undefined, {
      _scrollToTop: false,
    });
  };

  const isClosed = closedDealStages(dealPipelineStatuses).includes(deal.stage);
  const owner = deal.sales_id ? signals?.owners.get(deal.sales_id) : undefined;
  const quote = signals?.latestQuotes.get(deal.id);
  const translate = useTranslate();

  return (
    <div
      // The gap between cards is padding INSIDE the draggable, so the drag
      // library counts it when it moves the neighbours out of the way.
      className="cursor-pointer pb-2"
      {...provided?.draggableProps}
      {...provided?.dragHandleProps}
      ref={provided?.innerRef}
      onClick={handleClick}
    >
      <RecordContextProvider value={deal}>
        <Card
          className={cn(
            "gap-0 rounded-xl py-0 transition-all duration-200",
            // Dark mode: the lane sinks towards the page and the card rises a
            // step above the surface, with a full-strength border and a faint
            // top highlight. On the default card token the two were within a
            // few hundredths of lightness and the cards ran together.
            "dark:border-border dark:bg-surface-muted dark:shadow-[inset_0_1px_0_0_oklch(1_0_0/0.05),var(--elevation-card)] dark:hover:bg-muted",
            snapshot?.isDragging
              ? "rotate-1 border-brand/40 opacity-95 shadow-float"
              : "hover:-translate-y-px hover:border-border-strong hover:shadow-raised",
          )}
        >
          <div className="flex flex-col gap-2 px-3 pt-3 pb-2.5">
            {/* Who, then what: the company as a quiet line above the deal. */}
            <div className="flex items-center gap-2">
              <ReferenceField
                source="company_id"
                reference="companies"
                link={false}
              >
                <CompanyAvatar width={20} height={20} />
              </ReferenceField>
              <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                <ReferenceField
                  source="company_id"
                  reference="companies"
                  link={false}
                />
              </p>
              {owner ? <OwnerAvatar owner={owner} /> : null}
            </div>
            <p className="line-clamp-2 text-sm leading-snug font-medium">
              {deal.name}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-base font-semibold tracking-tight tabular-nums">
                {formatMoney(deal.amount, currency)}
                {deal.amount_source_quote_id != null ? (
                  // The amount is a quotation's total, kept by the server.
                  <Receipt
                    className="size-3.5 text-muted-foreground"
                    aria-label={translate(
                      "resources.deals.board.amount_from_quote",
                    )}
                  />
                ) : null}
              </span>
              {deal.category ? (
                <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  <SelectField
                    source="category"
                    choices={dealCategories}
                    optionText="label"
                    optionValue="value"
                  />
                </span>
              ) : null}
            </div>
          </div>

          {quote ? (
            // The quotation the pipeline follows: its number and where it stands.
            <div
              className="flex min-w-0 items-center gap-1.5 border-t border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground"
              title={translate("resources.deals.board.latest_quote")}
            >
              <FileText className="size-3 shrink-0" aria-hidden />
              <span className="truncate tabular-nums">
                {quote.quote_number}
              </span>
              <QuoteStatusBadge
                statusKey={quote.status_key}
                label={quote.status_label}
              />
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
            <CloseDate
              value={deal.expected_closing_date}
              isClosed={isClosed}
              now={signals?.now}
            />
            {signals && signals.hasTasks && !isClosed ? (
              <ActivityIndicator
                task={signals.nextTasks.get(deal.id)}
                now={signals.now}
              />
            ) : null}
          </div>
        </Card>
      </RecordContextProvider>
    </div>
  );
};

const CloseDate = ({
  value,
  isClosed,
  now = new Date(),
}: {
  value?: string | null;
  isClosed: boolean;
  now?: Date;
}) => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();

  if (!value) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CalendarOff className="size-3" />
        {translate("resources.deals.board.no_close_date")}
      </span>
    );
  }

  const date = parseCalendarDate(value);
  const status = isClosed ? "later" : closeDateStatus(value, now);

  return (
    <span
      title={translate("resources.deals.board.close_date", {
        date: date.toLocaleDateString(locale, { dateStyle: "long" }),
      })}
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
        status === "overdue" &&
          "bg-destructive/10 font-medium text-destructive",
        status === "soon" && "bg-warning-tint font-medium text-warning",
        status === "later" && "-ml-1.5 text-muted-foreground",
      )}
    >
      <CalendarClock className="size-3 shrink-0" />
      <span className="truncate">{formatRelativeDay(date, locale, now)}</span>
    </span>
  );
};

const ActivityIndicator = ({ task, now }: { task?: Task; now: Date }) => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const { taskTypes } = useConfigurationContext();

  if (!task) {
    return (
      <Indicator
        label={translate("resources.deals.board.no_task")}
        className="bg-warning-tint text-warning"
      >
        <CircleDashed />
      </Indicator>
    );
  }

  const typeLabel =
    task.type_key && task.type_key !== "none"
      ? (taskTypes.find((type) => type.value === task.type_key)?.label ??
        task.type_label)
      : null;
  const name = [typeLabel, task.title].filter(Boolean).join(" · ");
  const due = task.due_date ? new Date(task.due_date) : null;
  const when = due ? ` (${formatRelativeDay(due, locale, now)})` : "";
  const isOverdue = due != null && calendarDaysBetween(due, now) < 0;

  return isOverdue ? (
    <Indicator
      label={translate("resources.deals.board.overdue_task", {
        task: name + when,
      })}
      className="bg-destructive/10 text-destructive"
    >
      <CalendarX />
    </Indicator>
  ) : (
    <Indicator
      label={translate("resources.deals.board.next_task", {
        task: name + when,
      })}
      className="bg-success/10 text-success"
    >
      <CalendarCheck />
    </Indicator>
  );
};

const Indicator = ({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        role="img"
        aria-label={label}
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full [&>svg]:size-3.5",
          className,
        )}
      >
        {children}
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-64">
      {label}
    </TooltipContent>
  </Tooltip>
);

const OwnerAvatar = ({ owner }: { owner: Sale }) => {
  const translate = useTranslate();
  const name = `${owner.first_name} ${owner.last_name}`.trim();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar
          className="size-5 shrink-0"
          aria-label={translate("resources.deals.board.owner", { name })}
        >
          <AvatarImage src={owner.avatar?.src ?? undefined} />
          <AvatarFallback className="text-[9px] font-semibold">
            {owner.first_name?.charAt(0)}
            {owner.last_name?.charAt(0)}
          </AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent side="top">
        {translate("resources.deals.board.owner", { name })}
      </TooltipContent>
    </Tooltip>
  );
};
