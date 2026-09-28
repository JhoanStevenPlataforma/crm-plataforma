import { useMemo } from "react";
import { useStore, useTranslate } from "ra-core";

import type { DealStage, LabeledValue, NoteStatus } from "../types";
import { translateConfigurationLabels } from "./configurationLabels";
import { defaultConfiguration } from "./defaultConfiguration";

export const CONFIGURATION_STORE_KEY = "app.configuration";

export interface ConfigurationContextValue {
  companySectors: LabeledValue[];
  currency: string;
  dealCategories: LabeledValue[];
  dealPipelineStatuses: string[];
  dealStages: DealStage[];
  leadSources: LabeledValue[];
  leadStatuses: LabeledValue[];
  noteStatuses: NoteStatus[];
  /** Families the product catalogue is browsed by (quotes §2.1). */
  productCategories: LabeledValue[];
  /** Units a product is sold in (quotes §2.1). */
  productUnits: LabeledValue[];
  taskTypes: LabeledValue[];
  title: string;
  darkModeLogo: string;
  lightModeLogo: string;
}

/**
 * The configuration as stored, labels untranslated. Only Settings reads this:
 * it edits the stored labels, and saving a translated copy would pin today's
 * language into every other user's screen.
 */
export const useStoredConfiguration = () => {
  const [config] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
    defaultConfiguration,
  );
  // Merge with defaults so that missing fields in stored config
  // fall back to default values (e.g. when new settings are added)
  return useMemo(() => ({ ...defaultConfiguration, ...config }), [config]);
};

/** The configuration for display: shipped labels in the user's language. */
export const useConfigurationContext = () => {
  const config = useStoredConfiguration();
  const translate = useTranslate();
  return useMemo(
    () => translateConfigurationLabels(config, translate),
    [config, translate],
  );
};

export const useConfigurationUpdater = () => {
  const [, setConfig] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
  );
  return setConfig;
};
