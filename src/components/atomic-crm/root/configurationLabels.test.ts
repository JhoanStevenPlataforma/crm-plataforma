import { afterEach, describe, expect, it } from "vitest";

import { i18nProvider } from "../providers/commons/i18nProvider";
import {
  configurationLabelKey,
  TRANSLATED_LISTS,
  translateConfigurationLabels,
} from "./configurationLabels";
import { defaultConfiguration } from "./defaultConfiguration";

const translate = (key: string, options?: object) =>
  i18nProvider.translate(key, options);

afterEach(async () => {
  await i18nProvider.changeLocale("en");
});

describe("translateConfigurationLabels", () => {
  it("shows the shipped labels in the active language", async () => {
    await i18nProvider.changeLocale("es");

    const config = translateConfigurationLabels(
      defaultConfiguration,
      translate,
    );

    expect(config.dealStages.map((stage) => stage.label)).toContain(
      "Oportunidad",
    );
    expect(
      config.companySectors.find((s) => s.value === "health-care")?.label,
    ).toBe("Salud");
  });

  it("keeps a label an admin customised, and the rest of the entry", async () => {
    await i18nProvider.changeLocale("es");
    const customised = {
      ...defaultConfiguration,
      dealStages: [
        { value: "opportunity", label: "Lead caliente", probability: 0.25 },
        { value: "won", label: "Won" },
      ],
    };

    const config = translateConfigurationLabels(customised, translate);

    expect(config.dealStages).toEqual([
      { value: "opportunity", label: "Lead caliente", probability: 0.25 },
      { value: "won", label: "Ganada" },
    ]);
  });

  it.each(["en", "es", "fr"])(
    "has a %s translation for every shipped label",
    async (locale) => {
      await i18nProvider.changeLocale(locale);

      const missing = TRANSLATED_LISTS.flatMap((list) =>
        defaultConfiguration[list]
          .map((item) => configurationLabelKey(list, item.value))
          .filter((key) => translate(key) === key),
      );

      expect(missing).toEqual([]);
    },
  );
});
