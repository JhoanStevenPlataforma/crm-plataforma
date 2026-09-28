import { useTranslate } from "ra-core";
import { useMemo } from "react";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { LabeledValue } from "../types";

/**
 * The configured lead statuses plus `converted`.
 *
 * `converted` is written by `convert_lead()` and is deliberately absent from
 * the configured list (nobody picks it on a form), so a screen labelling
 * statuses from the configuration alone printed the raw key "converted".
 */
export const useLeadStatusChoices = (): LabeledValue[] => {
  const translate = useTranslate();
  const { leadStatuses } = useConfigurationContext();
  return useMemo(
    () => [
      ...leadStatuses,
      {
        value: "converted",
        label: translate("resources.leads.statuses.converted"),
      },
    ],
    [leadStatuses, translate],
  );
};
