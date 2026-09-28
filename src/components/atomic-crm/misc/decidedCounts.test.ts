import { afterEach, describe, expect, it } from "vitest";

import { i18nProvider } from "../providers/commons/i18nProvider";
import { decidedCounts } from "./decidedCounts";

const translate = (key: string, options?: object) =>
  i18nProvider.translate(key, options);

describe("decidedCounts", () => {
  afterEach(async () => {
    await i18nProvider.changeLocale("en");
  });

  it("inflects each count on its own, so one win is singular", async () => {
    await i18nProvider.changeLocale("es");

    expect(
      translate("crm.analytics.kpi.decided", decidedCounts(translate, 1, 3)),
    ).toBe("1 ganada / 3 perdidas");
    expect(
      translate(
        "crm.teams_dashboard.decided_deals",
        decidedCounts(translate, 2, 1),
      ),
    ).toBe("2 ganadas, 1 perdida");
  });
});
