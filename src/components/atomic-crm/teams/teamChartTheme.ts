/**
 * Moved to `misc/chartTheme.ts` when the analytics module started drawing the
 * same charts: nothing in the palette was ever team-specific, and two copies of
 * a colour system is how the two dashboards end up disagreeing about what green
 * means.
 *
 * Kept as a re-export so the eight chart components in this folder did not have
 * to change in the same commit that introduced the shared module.
 */
export {
  barDefaults,
  bottomLegend,
  nivoTheme,
  useChartPalette,
  type ChartPalette,
  type ChartRole,
} from "../misc/chartTheme";
