import { useEffect, useState } from "react";

import { useTheme } from "@/components/admin/use-theme";

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
 * palette flipped — three of these hues fall below 3:1 contrast on one surface
 * or the other, and the step that works on white is not the step that works on
 * near-black.
 */

export type ChartRole = "reference" | "inFlight" | "good" | "bad";

const LIGHT: Record<ChartRole, string> = {
  reference: "#9ca3af",
  inFlight: "#2a78d6",
  good: "#1baf7a",
  bad: "#e34948",
};

const DARK: Record<ChartRole, string> = {
  reference: "#6b7280",
  inFlight: "#3987e5",
  good: "#199e70",
  bad: "#e66767",
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
 * Axis, grid and legend styling. Everything here is a CSS variable, so the
 * chrome follows the app theme without this module knowing anything about it —
 * only the data marks need the resolved palette above.
 */
export const nivoTheme = {
  axis: {
    domain: { line: { stroke: "var(--color-border)" } },
    ticks: { text: { fill: "var(--color-muted-foreground)" } },
    legend: { text: { fill: "var(--color-muted-foreground)" } },
  },
  legends: { text: { fill: "var(--color-muted-foreground)" } },
  grid: { line: { stroke: "var(--color-border)", strokeOpacity: 0.4 } },
  tooltip: {
    container: {
      background: "var(--color-popover)",
      color: "var(--color-popover-foreground)",
      fontSize: 12,
      borderRadius: 6,
      border: "1px solid var(--color-border)",
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
 * `innerPadding` is the 2px surface gap that keeps stacked segments from
 * bleeding into one another, and `labelSkip*` is the relief the validator asks
 * for: two of these hues sit under 3:1 against the light surface, so the value
 * is printed on any segment big enough to hold it rather than being carried by
 * colour alone.
 */
export const barDefaults = {
  theme: nivoTheme,
  padding: 0.25,
  innerPadding: 2,
  borderRadius: 3,
  labelSkipWidth: 32,
  labelSkipHeight: 16,
  labelTextColor,
} as const;

/** The legend block every multi-series chart here uses. Identity is never colour alone. */
export const bottomLegend = [
  {
    dataFrom: "keys" as const,
    anchor: "bottom" as const,
    direction: "row" as const,
    translateY: 45,
    itemWidth: 100,
    itemHeight: 16,
  },
];
