import { format } from "date-fns";

import type { DealStage } from "../types";

export const findDealLabel = (dealStages: DealStage[], dealValue: string) => {
  const dealStage = dealStages.find((stage) => stage.value === dealValue);
  return dealStage?.label;
};

/**
 * How much of a deal in this stage counts towards a weighted forecast, 0..1.
 *
 * Null when the configuration says nothing, and callers must skip those rather
 * than default them: treating an unconfigured stage as 0 quietly shrinks the
 * forecast, and treating it as 1 quietly inflates it. Both are worse than
 * leaving the stage out and saying so.
 */
export const findDealProbability = (
  dealStages: DealStage[],
  dealValue: string,
): number | null =>
  dealStages.find((stage) => stage.value === dealValue)?.probability ?? null;

export function getRelativeTimeString(
  dateString: string,
  locale = "en",
): string {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diff = date.getTime() - today.getTime();
  const unitDiff = Math.round(diff / (1000 * 60 * 60 * 24));

  // Check if the date is more than one week old
  if (Math.abs(unitDiff) > 7) {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
    }).format(date);
  }

  // Intl.RelativeTimeFormat for dates within the last week
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return ucFirst(rtf.format(unitDiff, "day"));
}

function ucFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const isoDateStringRegex = /^\d{4}-\d{2}-\d{2}$/;

export function formatISODateString(dateString: string, locale?: string) {
  if (!isoDateStringRegex.test(dateString)) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }
  const date = localDate(dateString);
  // With a locale, the user's own format ("28 sept 2026"); without one, the
  // historical date-fns "PP" ("Sep 28, 2026").
  return locale
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
    : format(date, "PP");
}

// Some browsers will consider a date in the format YYYY-MM-DD as UTC, which can
// cause off-by-one-day issues depending on the user's timezone. To avoid this,
// parse the date components manually and create a date in the local timezone.
function localDate(dateString: string) {
  const [year, month, day] = dateString.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Whether a closing date is strictly before today. Compared by calendar day:
 * a deal due today is due, not overdue — comparing against `new Date()`
 * flagged it "Past" from the first minute of the day.
 */
export function isPastDay(dateString: string, today: Date = new Date()) {
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return localDate(dateString) < startOfToday;
}
