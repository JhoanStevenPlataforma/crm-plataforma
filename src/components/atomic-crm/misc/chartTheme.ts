import { useEffect, useState } from "react";

import { useTheme } from "@/components/admin/use-theme";

import { CrmBarTooltip, CrmColumn, CrmHorizontalBar } from "./chartMarks";

/**
 * One colour system for every chart on the team dashboards.
 *
 * The palette it replaces was three steps of the same teal. It failed on
 * measurement, not on taste: `won` (#2dd4bf) against `pipeline` (#5eead4) sat at
 * ΔE 7.1 for NORMAL vision — below the 15 floor, so a manager with no colour
 * deficiency at all could not reliably tell the two bars apart — and the third
 * bar was a near-gray that vanished under deuteranopia. Adding a fourth and
 * fifth series to those charts would have made it unreadable.
 *
 * Three hues carry meaning, and the meaning is the same on every chart here:
 *
 *   green  — the good terminal state: won, completed
 *   blue   — still in flight: pipeline, pending, created
 *   red    — the bad terminal state: lost, overdue
 *
 * Plus one recessive gray for a REFERENCE mark (a budget, a target). Gray is
 * deliberately below the chroma floor a categorical hue must clear: it is not a
 * category, it is the line the categories are measured against, and it has to
 * stay quiet.
 *
 * ORDERING IS PART OF THE PALETTE. Green next to red is the deuteranopia
 * collision (ΔE 6.9), so blue always sits between them: pass the keys to nivo as
 * green, blue, red and never in another order. Every ordering used here was run
 * through the validator in both light and dark mode.
 *
 * Dark mode is a selected set of steps for the dark surface, not the light
 * palette flipped: the step that works on white is not the step that works on
 * near-black.
 *
 * THE HUES ("Midnight jewel", 2026-09-24). Chosen to sit inside the CRM's
 * Midnight & Amber shell rather than beside it: the blue leans indigo (hue
 * ~268, the ink of the sidebar and the dark ground), the green is an emerald
 * rather than a stock mint, the red a rose rather than a fire-engine red, and
 * the reference gray is the shell's own ink-tinted slate. The amber brand hue
 * is deliberately NOT a chart role (ui-redesign.md, D6).
 *
 * Measured with the dataviz validator on the real surfaces (#FFFFFF card,
 * #111621 dark card), roles in their mandated order green, blue, red:
 *
 *   light  worst adjacent CVD ΔE 22.8 · normal-vision ΔE 26.6 · all >= 3:1
 *   dark   worst adjacent CVD ΔE 19.4 · normal-vision ΔE 23.1 · all >= 3:1
 *
 * The previous green (#1baf7a) sat at 2.74:1 on white; every role now clears
 * 3:1 in both themes. The gray fails the chroma floor on purpose (see above).
 */

export type ChartRole = "reference" | "inFlight" | "good" | "bad";

const LIGHT: Record<ChartRole, string> = {
  reference: "#a3acbd", // slate, ink-tinted
  inFlight: "#4263eb", // indigo
  good: "#0e9a74", // emerald
  bad: "#e0495f", // rose
};

const DARK: Record<ChartRole, string> = {
  reference: "#4b5468",
  inFlight: "#6184ef",
  good: "#21a97d",
  bad: "#e35e70",
};

/**
 * Resolves `system` against the OS setting and keeps up when it changes.
 *
 * `useTheme` returns the user's *choice*, which is "system" by default — using
 * it directly would paint the dark-surface steps onto a light page for most
 * users.
 */
const useIsDark = () => {
  const { theme } = useTheme();
  const [prefersDark, setPrefersDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) =>
      setPrefersDark(event.matches);

    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  return theme === "dark" || (theme === "system" && prefersDark);
};

export type ChartPalette = Record<ChartRole, string>;

export const useChartPalette = (): ChartPalette => (useIsDark() ? DARK : LIGHT);

/**
 * Axis, grid, legend and tooltip chrome. Everything here is a CSS variable, so
 * it follows the app theme without this module knowing anything about it --
 * only the data marks need the resolved palette above.
 *
 * The chrome is deliberately recessive: no axis lines (the zero gridline is
 * the baseline), no tick marks, solid hairline gridlines, 11px muted ticks in
 * tabular figures so a column of amounts aligns. The data is the only loud
 * thing on the plot.
 */
export const nivoTheme = {
  text: {
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    fontSize: 11,
    fill: "var(--color-muted-foreground)",
  },
  axis: {
    domain: { line: { stroke: "transparent", strokeWidth: 0 } },
    ticks: {
      line: { stroke: "transparent", strokeWidth: 0 },
      text: {
        fill: "var(--color-muted-foreground)",
        fontSize: 11,
        fontVariantNumeric: "tabular-nums",
      },
    },
    legend: {
      text: {
        fill: "var(--color-muted-foreground)",
        fontSize: 11,
        fontWeight: 500,
      },
    },
  },
  legends: {
    text: { fill: "var(--color-muted-foreground)", fontSize: 12 },
  },
  grid: {
    line: {
      stroke: "var(--color-border)",
      strokeWidth: 1,
      strokeOpacity: 0.75,
    },
  },
  labels: {
    text: { fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  },
  tooltip: {
    // The readout draws its own card (`CrmBarTooltip`); nivo's wrapper stays
    // invisible so the two never double up.
    container: {
      background: "transparent",
      padding: 0,
      boxShadow: "none",
      border: "none",
    },
  },
};

/**
 * Typed here rather than inline: the `as const` below would freeze `modifiers`
 * into a readonly tuple, and nivo's `InheritedColorConfigFromContext` wants a
 * mutable `ColorModifier[]`.
 */
const labelTextColor: { from: string; modifiers: ["darker", number][] } = {
  from: "color",
  modifiers: [["darker", 3]],
};

/**
 * Shared bar settings.
 *
 * `innerPadding` is the 2px surface gap between touching marks, and the bar
 * component caps each mark at 24px with a rounded data end (see
 * `chartMarks.tsx`). Horizontal charts swap in `CrmHorizontalBar`.
 *
 * Values are printed on any horizontal bar big enough to hold them, and
 * `ChartCard` offers a table view, so no figure depends on hovering.
 */
export const barDefaults = {
  theme: nivoTheme,
  padding: 0.3,
  innerPadding: 2,
  borderRadius: 4,
  labelSkipWidth: 36,
  labelSkipHeight: 16,
  labelTextColor,
  // Off for columns: a figure never fits a 24px column, and nivo judges the
  // fit on the band, not on the narrowed mark. Horizontal bars turn it back on.
  enableLabel: false,
  enableGridX: false,
  barComponent: CrmColumn,
  tooltip: CrmBarTooltip,
  motionConfig: "gentle",
} as const;

/** The same, for `layout="horizontal"`. Spread after `barDefaults`. */
export const horizontalBarProps = {
  barComponent: CrmHorizontalBar,
  enableLabel: true,
  // A compact money figure ("$339.2K") needs ~64px with padding; below that
  // the value lives in the tooltip and the table, never spilling off its bar.
  labelSkipWidth: 72,
  enableGridY: false,
  enableGridX: true,
} as const;

/**
 * A categorical sequence, for charts whose series are not semantic.
 *
 * The four roles above cover every chart on the team and analytics dashboards,
 * because those charts were designed around them: won is good, pipeline is in
 * flight, lost is bad. The report builder cannot rely on that — a user may
 * group deals by sector and stack six industries, none of which is "good".
 *
 * DERIVATION. The first three entries ARE the semantic hues, in the order the
 * block above mandates: green, then blue, then red, so blue always sits between
 * the two that collide under deuteranopia. A report whose series happen to be
 * won / pipeline / lost therefore gets the correct semantic colours from
 * position alone. Violet, ochre and teal extend it; the recessive gray is
 * deliberately NOT in it: gray marks a reference, and a category drawn in it
 * would read as one.
 *
 * MEASURED, all six, adjacent pairs (stacks and grouped bars), on the real
 * surfaces. The extension order was searched, not picked: ochre beside the
 * rose fell below the normal-vision floor in dark mode, so violet comes first.
 *
 *   light  worst CVD ΔE 17.3 (violet↔rose) · normal-vision 21.9 · all >= 3:1
 *   dark   worst CVD ΔE 15.9 (violet↔rose) · normal-vision 19.4 · all >= 3:1
 */
const LIGHT_CATEGORICAL: string[] = [
  "#0e9a74", // emerald — the semantic good
  "#4263eb", // indigo  — the semantic in-flight
  "#e0495f", // rose    — the semantic bad
  "#8951bf", // violet
  "#c98212", // ochre
  "#0090a9", // teal
];

const DARK_CATEGORICAL: string[] = [
  "#21a97d",
  "#6184ef",
  "#e35e70",
  "#9763cc",
  "#c38824",
  "#009fb4",
];

/**
 * Six colours for the report charts, in the resolved theme.
 *
 * Selected for the dark surface rather than flipped from the light set, for the
 * same reason the roles above are: the step that works on white is not the step
 * that works on near-black.
 */
export const useCategoricalPalette = (): string[] =>
  useIsDark() ? DARK_CATEGORICAL : LIGHT_CATEGORICAL;
