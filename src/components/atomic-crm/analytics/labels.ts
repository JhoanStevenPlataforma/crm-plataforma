import type { LabeledValue } from "../types";

/** Terminal stages. The same literals the SQL and `teams_summary` use. */
export const TERMINAL_STAGES = ["won", "lost"];

/**
 * A configured label for a stored key, falling back to the key itself.
 *
 * The fallback matters: `deals.stage`, `leads.source` and `leads.status` are
 * free text, and the option lists are application configuration. A value that
 * was renamed in the configuration — or one the database has and the config
 * does not, like the `converted` status written by `convert_lead()` — must
 * still appear on the chart rather than vanish or render as blank.
 */
export const labelOf = (options: LabeledValue[], value: string): string =>
  options.find((option) => option.value === value)?.label ?? value;

/**
 * The stage keys that count as live pipeline, from the configuration.
 *
 * Derived rather than hardcoded so a customer who renames or adds a stage gets
 * the right list. Used to build a `stage@in` filter: the FakeRest adapter has
 * no `@not.in`, and an `@in` over the open stages is the same predicate stated
 * from the configuration's side.
 */
export const openStageKeys = (stages: LabeledValue[]): string[] =>
  stages
    .map((stage) => stage.value)
    .filter((value) => !TERMINAL_STAGES.includes(value));
