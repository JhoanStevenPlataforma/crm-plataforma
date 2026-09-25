import {
  BarItem,
  type BarDatum,
  type BarItemProps,
  type BarTooltipProps,
} from "@nivo/bar";

/**
 * The marks every bar chart in the CRM draws, and their tooltip.
 *
 * Wraps nivo's own `BarItem` rather than replacing it, so its animation, its
 * tooltip wiring and its keyboard focus are kept; only the geometry changes:
 *
 * - **Thin.** A bar never grows past `BAR_MAX` (24px), whatever the band
 *   width. On a six-month chart nivo used to fill each slot with a 90px slab;
 *   the leftover band is now air, which is what lets the eye compare heights.
 * - **Rounded at the data end, square at the baseline.** The value lives at
 *   the tip, so that is the end that is shaped; the base sits flat on the axis.
 *   Drawn as a rect rounded on every corner, extended by the radius past the
 *   baseline and clipped back by the same amount (`.crm-bar-*` in index.css).
 *
 * Labels are re-centred on the narrowed mark. A value label is only printed by
 * nivo when the ORIGINAL band is wide enough, so vertical columns turn labels
 * off (a figure never fits in 24px); the tooltip and the chart's table view
 * carry the value instead.
 */

export const BAR_MAX = 24;
export const BAR_RADIUS = 4;

const TRANSLATE = /translate\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)\s*\)/;

/**
 * `BarItem` renders its style through react-spring's animated elements, which
 * accept an interpolation (`spring.to(...)`) anywhere they accept a spring.
 * Its prop type only names `SpringValue`, so the derived style is cast once
 * here rather than at each property.
 */
type BarStyle<D extends BarDatum> = BarItemProps<D>["style"];
const asBarStyle = <D extends BarDatum>(style: object): BarStyle<D> =>
  style as BarStyle<D>;

const shift = (transform: string, dx: number, dy: number): string => {
  const match = TRANSLATE.exec(transform);
  if (!match) return transform;
  return `translate(${Number(match[1]) + dx}, ${Number(match[2]) + dy})`;
};

/** A column (vertical layout): capped width, rounded top, square base. */
export const CrmColumn = <D extends BarDatum>(props: BarItemProps<D>) => {
  const { bar, style } = props;
  const inset = Math.max(0, (bar.width - BAR_MAX) / 2);
  const isNegative = Number(bar.data.value ?? 0) < 0;

  return (
    <g className={isNegative ? "crm-bar crm-bar-down" : "crm-bar crm-bar-up"}>
      <BarItem
        {...props}
        borderRadius={BAR_RADIUS}
        style={asBarStyle<D>({
          ...style,
          width: style.width.to((width) => Math.min(width, BAR_MAX)),
          height: style.height.to((height) =>
            height > 0 ? height + BAR_RADIUS : height,
          ),
          // A negative column hangs from the baseline: its overshoot goes up.
          transform: style.transform.to((transform) =>
            shift(transform, inset, isNegative ? -BAR_RADIUS : 0),
          ),
          labelX: style.labelX.to((x) => x - inset),
        })}
      />
    </g>
  );
};

/** A bar (horizontal layout): capped thickness, rounded tip, square base. */
export const CrmHorizontalBar = <D extends BarDatum>(
  props: BarItemProps<D>,
) => {
  const { bar, style } = props;
  const inset = Math.max(0, (bar.height - BAR_MAX) / 2);

  return (
    <g className="crm-bar crm-bar-right">
      <BarItem
        {...props}
        borderRadius={BAR_RADIUS}
        style={asBarStyle<D>({
          ...style,
          height: style.height.to((height) => Math.min(height, BAR_MAX)),
          width: style.width.to((width) =>
            width > 0 ? width + BAR_RADIUS : width,
          ),
          transform: style.transform.to((transform) =>
            shift(transform, -BAR_RADIUS, inset),
          ),
          labelX: style.labelX.to((x) => x + BAR_RADIUS),
          labelY: style.labelY.to((y) => y - inset),
        })}
      />
    </g>
  );
};

/**
 * The hover readout: the category on top, then the series keyed by a short
 * line of its colour, with the VALUE as the strongest thing in the box -- the
 * reader already knows which bar they pointed at; the number is what they
 * came for.
 */
export const CrmBarTooltip = <D extends BarDatum>({
  id,
  formattedValue,
  color,
  indexValue,
}: BarTooltipProps<D>) => (
  <div className="min-w-44 rounded-lg border border-border/80 bg-popover px-3 py-2.5 text-popover-foreground shadow-float">
    <p className="mb-2 text-[0.6875rem] font-medium tracking-[0.04em] text-muted-foreground">
      {indexValue}
    </p>
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="h-[3px] w-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs text-muted-foreground">{id}</span>
      <span className="ml-auto pl-4 text-sm font-semibold tabular-nums">
        {formattedValue}
      </span>
    </div>
  </div>
);
