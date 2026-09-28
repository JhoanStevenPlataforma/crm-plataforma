import type { TranslateFunction } from "ra-core";

import type { ConfigurationContextValue } from "./ConfigurationContext";
import { defaultConfiguration } from "./defaultConfiguration";

/** The configuration lists whose labels ship with a translation. */
export const TRANSLATED_LISTS = [
  "companySectors",
  "dealCategories",
  "dealStages",
  "leadSources",
  "leadStatuses",
  "noteStatuses",
  "productCategories",
  "productUnits",
  "taskTypes",
] as const;

type TranslatedList = (typeof TRANSLATED_LISTS)[number];

export const configurationLabelKey = (list: TranslatedList, value: string) =>
  `crm.configuration.${list}.${value}`;

/**
 * The configuration stores its labels as text, in English out of the box, so
 * a Spanish user saw "Opportunity" and "Health Care". An entry is translated
 * only while its label is still the shipped default: a label an admin typed in
 * Settings is theirs, in whatever language they wrote it, and is left alone.
 */
export const translateConfigurationLabels = (
  config: ConfigurationContextValue,
  translate: TranslateFunction,
): ConfigurationContextValue => {
  const translated = { ...config };
  for (const list of TRANSLATED_LISTS) {
    const defaults = new Map(
      defaultConfiguration[list].map((item) => [item.value, item.label]),
    );
    // Each list keeps its own item shape (colour, probability), so only the
    // label is replaced and the rest of the entry is carried over as is.
    (translated as Record<TranslatedList, unknown>)[list] = config[list].map(
      (item) =>
        defaults.get(item.value) === item.label
          ? {
              ...item,
              label: translate(configurationLabelKey(list, item.value), {
                _: item.label,
              }),
            }
          : item,
    );
  }
  return translated;
};
