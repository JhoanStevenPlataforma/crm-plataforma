import { Plus } from "lucide-react";
import {
  CanAccess,
  useGetIdentity,
  useLocaleState,
  useTranslate,
} from "ra-core";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  DASHBOARD_PERIODS,
  greetingFor,
  type DashboardPeriod,
} from "./dashboardPeriod";

/**
 * Who is looking, at what slice of time, and the one thing they came to do.
 *
 * The greeting is not decoration: it is the only place the screen addresses the
 * reader, and it anchors the period control beside it so "this month" reads as
 * *the whole page's* scope rather than one card's.
 *
 * `summary` is passed in rather than composed here because it is built from the
 * KPI figures, which arrive asynchronously — a sentence assembled here would
 * either duplicate those queries or state a number the cards below contradict.
 */
export const DashboardHeader = ({
  period,
  onPeriodChange,
  summary,
}: {
  period: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
  summary?: string;
}) => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const [locale] = useLocaleState();
  const today = new Date().toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // First name only. "Good morning, Jhoan Steven Plata" reads like a summons.
  const name = identity?.fullName?.trim().split(" ")[0] ?? "";
  // Separate messages rather than an empty interpolation: "Buenos días, " with
  // a dangling comma is what an unnamed identity would otherwise render.
  const greetingKey = `crm.dashboard.greeting.${greetingFor()}${name ? "" : "_anonymous"}`;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {/* The portal's eyebrow: today's date, tracked out in amber. */}
        <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-brand uppercase">
          {today}
        </p>
        <h1 className="text-[2rem] leading-tight font-semibold">
          {translate(greetingKey, { name })}
        </h1>
        {/* Holds its line while the figures load, so the cards below do not
            jump down once the sentence appears. */}
        <p className="min-h-5 text-sm text-muted-foreground">{summary ?? ""}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={period}
          // Radix emits "" when the active item is clicked again. Treating that
          // as a value would clear the period and leave the page with no scope.
          onValueChange={(value) =>
            value ? onPeriodChange(value as DashboardPeriod) : undefined
          }
          variant="outline"
          size="sm"
          aria-label={translate("crm.dashboard.period.label")}
          // Five periods do not fit a phone: the row scrolls rather than
          // clipping "this year" off the screen.
          className="max-w-full overflow-x-auto rounded-lg bg-surface shadow-card"
        >
          {DASHBOARD_PERIODS.map((item) => (
            <ToggleGroupItem
              key={item}
              value={item}
              className="px-3 text-xs whitespace-nowrap data-[state=on]:bg-brand-tint data-[state=on]:font-medium data-[state=on]:text-brand-strong"
            >
              {translate(`crm.dashboard.period.${item}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* The one action a dashboard reader takes from here. Gated, because a
            rep who cannot create a deal should not be offered the button. */}
        <CanAccess resource="deals" action="create">
          <Button asChild size="sm">
            <Link to="/deals/create">
              <Plus className="size-4" />
              {translate("resources.deals.action.new")}
            </Link>
          </Button>
        </CanAccess>
      </div>
    </div>
  );
};
