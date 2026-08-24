import { ResponsiveBar } from "@nivo/bar";
import { useTranslate } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatMoney } from "./teamBudget";
import { TeamChartCard } from "./TeamChartCard";
import { barDefaults, bottomLegend, useChartPalette } from "./teamChartTheme";
import {
  formatMonthLabel,
  type MonthlyPoint,
  type StagePoint,
} from "./teamStats";

/**
 * The two money charts both drill-down pages draw.
 *
 * Shared rather than duplicated per page: a team and one of its members are the
 * same question at two scopes, and a manager comparing them needs the same axis
 * and the same colours to do it. The folding lives in `teamStats.ts`; these
 * components only render.
 */

/**
 * Won, still-open and lost, month by month.
 *
 * Lost is its own bar now. It used to be folded into `pipeline` — anything not
 * won was — which both inflated the forecast and made the losses invisible,
 * and a period's losses are the half of the story a forecast chart usually
 * hides.
 *
 * Key order is won, pipeline, lost, i.e. green, blue, red. That is a
 * legibility constraint, not a preference: green beside red is the
 * deuteranopia collision, so blue always separates them. See
 * `teamChartTheme.ts`.
 *
 * Only months with deals are plotted — see `monthlySeries`. A period that has
 * not started closing yet renders as the empty state rather than as a flat line
 * at zero, which would read as a run of failures.
 */
export const MonthlyPerformanceChart = ({
  points,
  title,
}: {
  points: MonthlyPoint[];
  title: string;
}) => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();
  const palette = useChartPalette();

  const wonLabel = translate("resources.teams.fields.won_amount");
  const pipelineLabel = translate("resources.teams.fields.pipeline_amount");
  const lostLabel = translate("crm.teams_dashboard.lost");

  const data = points.map((point) => ({
    month: formatMonthLabel(point.month),
    [wonLabel]: point.won,
    [pipelineLabel]: point.pipeline,
    [lostLabel]: point.lost,
  }));

  return (
    <TeamChartCard title={title} isEmpty={points.length === 0}>
      <ResponsiveBar
        data={data}
        indexBy="month"
        keys={[wonLabel, pipelineLabel, lostLabel]}
        groupMode="grouped"
        colors={[palette.good, palette.inFlight, palette.bad]}
        margin={{ top: 20, right: 20, bottom: 50, left: 70 }}
        {...barDefaults}
        enableLabel={false}
        axisLeft={{ format: (value: number) => formatMoney(value, currency) }}
        legends={bottomLegend}
      />
    </TeamChartCard>
  );
};

/**
 * Where the money sits in the pipeline, stage by stage.
 *
 * Fed by `pipelineByStage`, which drops `won` and `lost`: a chart headed
 * "pipeline by stage" that includes the terminal stages contradicts the
 * pipeline figure printed directly above it, and late in a good period the
 * largest bar — the one read first — was `won`.
 *
 * Stage keys are resolved through the app configuration rather than printed
 * raw: `in-negociation` is a database value, not a label a sales manager should
 * have to read.
 */
export const StageBreakdownChart = ({
  points,
  title,
}: {
  points: StagePoint[];
  title: string;
}) => {
  const { currency, dealStages } = useConfigurationContext();
  const palette = useChartPalette();

  const labelOf = (stage: string) =>
    dealStages.find((candidate) => candidate.value === stage)?.label ?? stage;

  const data = points.map((point) => ({
    stage: labelOf(point.stage),
    amount: point.amount,
  }));

  return (
    <TeamChartCard title={title} isEmpty={points.length === 0}>
      <ResponsiveBar
        data={data}
        indexBy="stage"
        keys={["amount"]}
        layout="horizontal"
        colors={[palette.inFlight]}
        margin={{ top: 10, right: 20, bottom: 40, left: 130 }}
        {...barDefaults}
        label={(datum) => formatMoney(datum.value ?? 0, currency)}
        axisBottom={{
          format: (value: number) => formatMoney(value, currency),
        }}
      />
    </TeamChartCard>
  );
};
