/**
 * A word-sized trend line: no axes, no labels, one hue.
 *
 * It answers only "which way has this been going", so it carries no scale —
 * the figure beside it is the number, and the chart below on the same screen
 * is where the months are read. A `null` point is a month with nothing to
 * measure (a win rate with no decided deal); the line breaks there rather than
 * drawing a zero that did not happen.
 */
const WIDTH = 100;
const HEIGHT = 32;
const PAD = 3;

export const Sparkline = ({
  values,
  color,
  label,
  className,
}: {
  values: readonly (number | null)[];
  color: string;
  /** What the line shows, for screen readers and the tooltip. */
  label: string;
  className?: string;
}) => {
  const present = values.filter((value): value is number => value != null);
  if (present.length < 2) return null;

  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;
  const x = (index: number) =>
    values.length === 1 ? WIDTH / 2 : (index / (values.length - 1)) * WIDTH;
  const y = (value: number) =>
    HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2);

  // Consecutive non-null runs, each drawn as its own line.
  const runs: { index: number; value: number }[][] = [];
  values.forEach((value, index) => {
    if (value == null) {
      runs.push([]);
      return;
    }
    if (runs.length === 0) runs.push([]);
    runs[runs.length - 1].push({ index, value });
  });

  const lastIndex =
    values.length -
    1 -
    [...values].reverse().findIndex((value) => value != null);
  const last = values[lastIndex] as number;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={className}
    >
      <title>{label}</title>
      {runs
        .filter((run) => run.length > 0)
        .map((run) => {
          const line = run
            .map((p, i) => `${i ? "L" : "M"}${x(p.index)},${y(p.value)}`)
            .join(" ");
          const area =
            run.length > 1
              ? `${line} L${x(run[run.length - 1].index)},${HEIGHT} L${x(run[0].index)},${HEIGHT} Z`
              : null;
          return (
            <g key={run[0].index}>
              {area ? <path d={area} fill={color} fillOpacity={0.12} /> : null}
              <path
                d={line}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      {/* The latest value, marked: it is the one the figure beside it shares. */}
      <circle
        cx={x(lastIndex)}
        cy={y(last)}
        r={2.5}
        fill={color}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
