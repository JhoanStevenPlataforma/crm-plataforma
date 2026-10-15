import { regex } from "ra-core";

import type { HelpTutorial } from "../types";

/** The shape `help_tutorials.slug` and `help_categories.slug` are checked against. */
export const validateSlug = regex(
  /^[a-z0-9]+(-[a-z0-9]+)*$/,
  "crm.help.errors.slug",
);

/** One step per line in the form, an array in the row. */
export const formatSteps = (steps: string[] | null | undefined) =>
  (steps ?? []).join("\n");
export const parseSteps = (text: string) => text.split("\n");

/** Blank lines are how a person separates steps while typing, not steps. */
export const cleanTutorial = <T extends Partial<HelpTutorial>>(data: T): T => ({
  ...data,
  steps: (data.steps ?? []).map((step) => step.trim()).filter(Boolean),
});
