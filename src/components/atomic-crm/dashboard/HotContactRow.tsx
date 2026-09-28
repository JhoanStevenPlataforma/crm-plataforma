import { CalendarClock, Mail, Phone, Plus, Target } from "lucide-react";
import { useLocaleState, useTranslate } from "ra-core";
import type { ReactNode } from "react";
import { Link } from "react-router";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { Avatar } from "../contacts/Avatar";
import { findDealLabel } from "../deals/dealUtils";
import { formatMoney } from "../misc/reporting";
import { calendarDaysBetween, formatRelativeDay } from "../misc/relativeTime";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Contact, Deal, Task } from "../types";
import { contactDisplayName } from "../contacts/contactName";
import { COOLING_AFTER_DAYS, daysSinceTouch } from "./hotContactSignals";

/**
 * One hot contact, as a reason to act rather than an address-book entry: how
 * long since the last touch, what money rides on them, and what happens next.
 *
 * The whole row opens the contact (a stretched link under the content); the
 * call and email buttons sit above it, so there is never a link nested in a
 * link.
 */
export const HotContactRow = ({
  contact,
  deal,
  nextTask,
  now,
}: {
  contact: Contact;
  deal?: Deal;
  nextTask?: Task;
  now: Date;
}) => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const { currency, dealStages, taskTypes } = useConfigurationContext();

  const name = contactDisplayName(contact);
  const silentDays = daysSinceTouch(contact.last_seen, now);
  const isCooling = silentDays >= COOLING_AFTER_DAYS;
  const subtitle = [contact.title, contact.company_name]
    .filter(Boolean)
    .join(" · ");
  const phone = contact.phone_jsonb?.find((entry) => entry.number)?.number;
  const email = contact.email_jsonb?.find((entry) => entry.email)?.email;

  const taskLabel = nextTask
    ? (nextTask.type_key !== "none"
        ? (taskTypes.find((type) => type.value === nextTask.type_key)?.label ??
          nextTask.type_label)
        : null) || nextTask.title
    : null;
  const taskDue = nextTask?.due_date ? new Date(nextTask.due_date) : null;
  const isTaskOverdue =
    taskDue != null && calendarDaysBetween(taskDue, now) < 0;

  return (
    <li className="group/hot relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
      <Link
        to={`/contacts/${contact.id}/show`}
        className="absolute inset-0 rounded-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        aria-label={name}
      />

      <div className="relative shrink-0 self-start pt-0.5">
        <Avatar record={contact} />
        {isCooling ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-warning ring-2 ring-card"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <time
              dateTime={contact.last_seen}
              // The short relative form keeps the name readable; the exact
              // count of silent days is one hover away.
              title={
                isCooling
                  ? translate("resources.contacts.hot.cooling_hint", {
                      smart_count: silentDays,
                    })
                  : translate("resources.contacts.hot.last_touch", {
                      date: new Date(contact.last_seen).toLocaleDateString(
                        locale,
                      ),
                    })
              }
              className={cn(
                "shrink-0 text-xs tabular-nums",
                isCooling
                  ? "font-medium text-warning"
                  : "text-muted-foreground",
              )}
            >
              {formatRelativeDay(new Date(contact.last_seen), locale, now)}
            </time>
          </div>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {deal ? (
            <Signal icon={<Target />}>
              <span className="font-medium text-foreground tabular-nums">
                {formatMoney(deal.amount, currency)}
              </span>
              {" · "}
              {findDealLabel(dealStages, deal.stage)}
            </Signal>
          ) : null}
          {nextTask ? (
            <Signal
              icon={<CalendarClock />}
              tone={isTaskOverdue ? "alert" : "default"}
            >
              <span className="max-w-32 truncate">{taskLabel}</span>
              {taskDue ? (
                <span className="shrink-0 whitespace-nowrap">
                  {" · "}
                  {formatRelativeDay(taskDue, locale, now)}
                </span>
              ) : null}
            </Signal>
          ) : (
            <Signal icon={<Plus />} tone="missing">
              {translate("resources.contacts.hot.no_next_task")}
            </Signal>
          )}
        </div>
      </div>

      {phone || email ? (
        // Above the stretched link, and revealed on hover or keyboard focus on
        // a pointer device; always shown on touch, which has no hover.
        <div className="relative flex shrink-0 flex-col gap-0.5 transition-opacity md:opacity-0 md:group-hover/hot:opacity-100 md:focus-within:opacity-100">
          {phone ? (
            <QuickAction
              href={`tel:${phone}`}
              label={translate("resources.contacts.hot.call", { name })}
            >
              <Phone />
            </QuickAction>
          ) : null}
          {email ? (
            <QuickAction
              href={`mailto:${email}`}
              label={translate("resources.contacts.hot.email", { name })}
            >
              <Mail />
            </QuickAction>
          ) : null}
        </div>
      ) : null}
    </li>
  );
};

const Signal = ({
  icon,
  tone = "default",
  children,
}: {
  icon: ReactNode;
  tone?: "default" | "alert" | "missing";
  children: ReactNode;
}) => (
  <span
    className={cn(
      "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] leading-4 [&>svg]:size-3 [&>svg]:shrink-0",
      tone === "default" &&
        "border border-border bg-surface text-muted-foreground",
      tone === "alert" && "bg-destructive/10 font-medium text-destructive",
      tone === "missing" &&
        "border border-dashed border-border-strong text-muted-foreground",
    )}
  >
    {icon}
    {children}
  </span>
);

const QuickAction = ({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <a
        href={href}
        aria-label={label}
        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&>svg]:size-3.5"
      >
        {children}
      </a>
    </TooltipTrigger>
    <TooltipContent side="left">{label}</TooltipContent>
  </Tooltip>
);
