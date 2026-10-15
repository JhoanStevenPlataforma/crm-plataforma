import { ResponsiveLine } from "@nivo/line";
import { useLocaleState, useTranslate } from "ra-core";

import { ChartCard } from "../misc/ChartCard";
import { nivoTheme, useChartPalette } from "../misc/chartTheme";
import type { ExchangeRate } from "../types";
import { formatDay, formatRate } from "./fxFormat";

/**
 * The evolution of one currency's rates. Official in the "in flight" blue and
 * the commercial rate in the recessive reference grey (`chartTheme.ts`): the
 * official rate is the measurement, the commercial one a line the company
 * drew against it. The Chart / Table switch keeps every figure readable
 * without hovering.
 */
export const RateEvolutionChart = ({
  currency,
  base,
  rates,
}: {
  currency: string;
  base: string;
  rates: ExchangeRate[];
}) => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const palette = useChartPalette();

  const seriesOf = (kind: "official" | "commercial") => {
    // One point per day: the last row of a day is the one in force.
    const byDay = new Map<string, number>();
    for (const rate of [...rates]
      .filter((row) => row.kind === kind)
      .sort((a, b) => Number(a.id) - Number(b.id))) {
      byDay.set(rate.effective_date, Number(rate.rate));
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({ x: day, y: value }));
  };

  const official = seriesOf("official");
  const commercial = seriesOf("commercial");
  const series = [
    {
      id: translate("crm.fx.kinds.official"),
      color: palette.inFlight,
      data: official,
    },
    {
      id: translate("crm.fx.kinds.commercial"),
      color: palette.reference,
      data: commercial,
    },
  ].filter((line) => line.data.length > 0);

  const days = [
    ...new Set([...official, ...commercial].map((point) => point.x)),
  ].sort();

  return (
    <ChartCard
      title={translate("crm.fx.history.chart_title", { currency })}
      subtitle={`${base} / 1 ${currency}`}
      isEmpty={series.length === 0}
      emptyLabel={translate("crm.fx.history.empty")}
      legend={series.map((line) => ({ label: line.id, color: line.color }))}
      table={{
        columns: [
          translate("crm.fx.history.effective"),
          ...series.map((line) => line.id),
        ],
        rows: [...days].reverse().map((day) => ({
          key: day,
          cells: [
            formatDay(day, locale),
            ...series.map((line) =>
              formatRate(
                line.data.find((point) => point.x === day)?.y ?? null,
                locale,
              ),
            ),
          ],
        })),
      }}
    >
      <ResponsiveLine
        data={series}
        theme={nivoTheme}
        colors={(line) => String(line.color)}
        margin={{ top: 12, right: 16, bottom: 36, left: 64 }}
        xScale={{
          type: "time",
          format: "%Y-%m-%d",
          precision: "day",
          useUTC: true,
        }}
        xFormat="time:%Y-%m-%d"
        yScale={{ type: "linear", min: "auto", max: "auto", nice: true }}
        axisBottom={{
          format: "%b %d",
          tickValues: 6,
          tickSize: 0,
          tickPadding: 8,
        }}
        axisLeft={{
          tickSize: 0,
          tickPadding: 8,
          tickValues: 5,
          format: (value) => formatRate(Number(value), locale),
        }}
        enableGridX={false}
        curve="monotoneX"
        lineWidth={2}
        pointSize={days.length > 60 ? 0 : 5}
        useMesh
        enableSlices="x"
        sliceTooltip={({ slice }) => (
          <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-float">
            <div className="mb-1 font-medium">
              {formatDay(
                String(slice.points[0]?.data.xFormatted ?? ""),
                locale,
              )}
            </div>
            {slice.points.map((point) => (
              <div key={point.id} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: point.seriesColor }}
                />
                <span>{point.seriesId}</span>
                <span className="ml-auto tabular-nums">
                  {formatRate(Number(point.data.y), locale)}
                </span>
              </div>
            ))}
          </div>
        )}
      />
    </ChartCard>
  );
};
