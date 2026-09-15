/**
 * Formatting and rate primitives shared by every reporting screen.
 *
 * They started in `teams/` and moved here when the analytics module needed the
 * same four. None of them was ever team-specific, and a second copy of
 * `formatMoney` is how two dashboards end up disagreeing about what "$1.2M"
 * means — or worse, how one screen rounds a rate up while the other rounds it
 * down and a manager is left reconciling two numbers that are the same number.
 *
 * `teams/teamBudget.ts`, `teams/teamStats.ts` and `teams/teamPace.ts` re-export
 * these, so their own callers and tests are untouched.
 */

/**
 * Money, formatted the way the deal cards already do it — same options, so the
 * dashboard and the pipeline never disagree about what "$1.2M" means.
 */
export const formatMoney = (
  value: number | null | undefined,
  currency: string,
  locale = "en-US",
) =>
  (value ?? 0).toLocaleString(locale, {
    notation: "compact",
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 1,
  });

/**
 * Money on a document: every unit, and exactly the two decimals the database
 * stores.
 *
 * `formatMoney` above is compact on purpose -- `$9.2M` is right on a dashboard
 * tile and wrong on a price list or a quotation, which must say
 * `$9,200,000.00` (quotes F4). Both live here so no screen grows a third copy.
 *
 * The decimals are pinned rather than left to the currency, because the
 * runtimes disagree about it: measured on 2026-09-14, Chromium formats COP with
 * no decimals and Node with two. Every amount in the quotes module is
 * `numeric(14,2)`, and a document that rounds a stored `1500.50` to `$1,501`
 * shows line amounts that no longer add up to the total beside them.
 *
 * A missing amount renders as an em dash, never as a price of zero.
 */
export const formatMoneyExact = (
  value: number | null | undefined,
  currency: string,
  locale = "en-US",
) =>
  value == null
    ? "—"
    : value.toLocaleString(locale, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

/** `0.42` -> `"42%"`, and `null` -> an em dash rather than "0%". */
export const formatAttainment = (ratio: number | null) =>
  ratio == null ? "—" : `${Math.round(ratio * 100)}%`;

/**
 * The month a chart axis shows: `"2026-03-01"` -> `"Mar 2026"`.
 *
 * Built from the parts rather than from `new Date(month)`, which parses a bare
 * `YYYY-MM-DD` as UTC midnight and renders it as the previous month for anyone
 * west of Greenwich.
 */
export const formatMonthLabel = (month: string, locale = "en-US") => {
  const [year, monthNumber] = month.split("-");
  const date = new Date(Number(year), Number(monthNumber) - 1, 1);
  return date.toLocaleDateString(locale, { month: "short", year: "numeric" });
};

/**
 * Won against everything that reached a decision.
 *
 * Open deals are excluded from the denominator on purpose: counting them as
 * not-yet-won drags every rate towards zero early in a period and makes the
 * number say more about the calendar than about the selling. Null when nothing
 * has closed either way.
 */
export const winRate = (
  nbWon: number | null | undefined,
  nbLost: number | null | undefined,
): number | null => {
  const won = nbWon ?? 0;
  const decided = won + (nbLost ?? 0);
  return decided === 0 ? null : won / decided;
};
