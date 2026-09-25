/**
 * How a KPI moved against the same stretch of the previous period.
 *
 * Kept apart from the cards so the two traps are tested once:
 *
 * - A percentage over a zero base is infinite, and "+∞%" or "+100%" both
 *   misreport "we had nothing and now have $57K". Over a zero base the change
 *   is given as an absolute amount instead.
 * - A rate is compared in percentage POINTS. 40% → 50% is "+10 pts", not
 *   "+25%", which a reader would take for the rate itself.
 */

export type DeltaDirection = "up" | "down" | "flat";

export type AmountDelta =
  | { kind: "percent"; direction: DeltaDirection; ratio: number }
  | { kind: "absolute"; direction: DeltaDirection; amount: number };

/** Below half a percent a change is noise, and reads as "no change". */
const FLAT_RATIO = 0.005;

const directionOf = (value: number, flatBelow: number): DeltaDirection =>
  Math.abs(value) < flatBelow ? "flat" : value > 0 ? "up" : "down";

export const compareAmounts = (
  current: number,
  previous: number,
): AmountDelta => {
  if (previous === 0) {
    return {
      kind: "absolute",
      direction: directionOf(current, Number.EPSILON),
      amount: current,
    };
  }
  const ratio = (current - previous) / Math.abs(previous);
  return { kind: "percent", direction: directionOf(ratio, FLAT_RATIO), ratio };
};

/**
 * Difference in percentage points, or null when either side has no rate (no
 * deal was decided in that stretch): there is nothing to compare.
 */
export const compareRates = (
  current: number | null,
  previous: number | null,
): { direction: DeltaDirection; points: number } | null => {
  if (current == null || previous == null) return null;
  const points = Math.round((current - previous) * 100);
  return { direction: directionOf(points, 1), points };
};
