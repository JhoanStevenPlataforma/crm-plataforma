import { useTranslate } from "ra-core";

import { ChartCard } from "../misc/ChartCard";
import { useCategoricalPalette } from "../misc/chartTheme";

/**
 * A donut, drawn as inline SVG.
 *
 * No `@nivo/pie`: only `@nivo/bar` is installed, and adding a package is a
 * supply-chain decision that belongs to a human (`dependency-safety.md`). A
 * donut is four trigonometric lines and an arc path, so importing a library for
 * it would be the more expensive choice even if the rule did not exist.
 *
 * It is offered for ONE metric over ONE dimension and nothing else. A donut
 * answers "what share of the whole", so a second metric has no whole to be a
 * share of, and negative values cannot be drawn as an angle at all — both are
 * refused in `validateAgainstCatalog` rather than rendered as something
 * misleading.
 *
 * The legend carries the value and the share as text. An arc's angle is hard to
 * compare and its colour is not an identity, so neither is left to carry the
 * meaning alone.
 */

const SIZE = 220;
const RADIUS = 96;
const INNER = 58;

/** Cartesian point on the circle for an angle measured clockwise from 12. */
const point = (angle: number, radius: number) => {
  const radians = (angle - 90) * (Math.PI / 180);
  return {
    x: SIZE / 2 + radius * Math.cos(radians),
    y: SIZE / 2 + radius * Math.sin(radians),
  };
};

const arcPath = (start: number, end: number) => {
  // A full circle has no arc: the start and end points coincide, so the `A`
  // command draws nothing and the chart renders empty. Two half arcs instead.
  if (end - start >= 360) {
    const top = point(0, RADIUS);
    const bottom = point(180, RADIUS);
    const innerTop = point(0, INNER);
    const innerBottom = point(180, INNER);
    return [
      `M ${top.x} ${top.y}`,
      `A ${RADIUS} ${RADIUS} 0 1 1 ${bottom.x} ${bottom.y}`,
      `A ${RADIUS} ${RADIUS} 0 1 1 ${top.x} ${top.y}`,
      `M ${innerTop.x} ${innerTop.y}`,
      `A ${INNER} ${INNER} 0 1 0 ${innerBottom.x} ${innerBottom.y}`,
      `A ${INNER} ${INNER} 0 1 0 ${innerTop.x} ${innerTop.y}`,
      "Z",
    ].join(" ");
  }

  const outerStart = point(start, RADIUS);
  const outerEnd = point(end, RADIUS);
  const innerEnd = point(end, INNER);
  const innerStart = point(start, INNER);
  const large = end - start > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER} ${INNER} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
};

export interface DonutSlice {
  label: string;
  value: number;
  formatted: string;
}

export const ReportDonut = ({
  title,
  subtitle,
  slices,
  emptyLabel,
}: {
  title: string;
  subtitle?: string;
  slices: DonutSlice[];
  emptyLabel?: string;
}) => {
  const translate = useTranslate();
  const palette = useCategoricalPalette();

  // Negative values have no angle. Rather than drawing them as positive — which
  // would show a loss as a share of the business — they are dropped and the
  // count is reported under the chart.
  const drawable = slices.filter((slice) => slice.value > 0);
  const dropped = slices.length - drawable.length;
  const total = drawable.reduce((sum, slice) => sum + slice.value, 0);

  let cursor = 0;
  const arcs = drawable.map((slice, index) => {
    const sweep = total > 0 ? (slice.value / total) * 360 : 0;
    const path = arcPath(cursor, cursor + sweep);
    cursor += sweep;
    return {
      ...slice,
      path,
      share: total > 0 ? slice.value / total : 0,
      color: palette[index % palette.length],
    };
  });

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      isEmpty={total <= 0}
      emptyLabel={emptyLabel}
      height={280}
    >
      {/* `ChartCard` renders its children inside one fixed-height box, so the
          footnote below has to share that box rather than sit after it. */}
      <div className="flex flex-col h-full gap-2">
        <div className="flex flex-col sm:flex-row items-center gap-6 flex-1 min-h-0">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width={SIZE}
            height={SIZE}
            role="img"
            aria-label={title}
            className="flex-none"
          >
            {arcs.map((arc) => (
              <path
                key={arc.label}
                d={arc.path}
                fill={arc.color}
                // A hairline in the surface colour separates adjacent slices, the
                // same 2px relief `barDefaults.innerPadding` gives stacked bars.
                stroke="var(--color-card)"
                strokeWidth={2}
              >
                <title>{`${arc.label}: ${arc.formatted}`}</title>
              </path>
            ))}
          </svg>

          <ul className="flex flex-col gap-1.5 min-w-0 flex-1 overflow-y-auto max-h-55">
            {arcs.map((arc) => (
              <li key={arc.label} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2.5 rounded-sm flex-none"
                  style={{ backgroundColor: arc.color }}
                />
                <span className="truncate flex-1 min-w-0">{arc.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {arc.formatted}
                </span>
                <span className="tabular-nums w-11 text-right">
                  {Math.round(arc.share * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        {dropped > 0 ? (
          <p className="text-xs text-muted-foreground flex-none">
            {translate("crm.reports.donut_negative_dropped", {
              smart_count: dropped,
            })}
          </p>
        ) : null}
      </div>
    </ChartCard>
  );
};
