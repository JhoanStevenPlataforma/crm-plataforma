import { beforeAll, describe, expect, it } from "vitest";

import { i18nProvider } from "../providers/commons/i18nProvider";
import { documentTitleFor } from "./documentTitle";

const translate = (key: string, options?: object) =>
  i18nProvider.translate(key, options);

describe("documentTitleFor", () => {
  beforeAll(async () => {
    await i18nProvider.changeLocale("en");
  });

  it("names the screen, then the product", () => {
    expect(documentTitleFor("/deals", translate, "Hermes CRM")).toBe(
      "Deals · Hermes CRM",
    );
  });

  it("keeps the section's name on a record inside it", () => {
    expect(documentTitleFor("/contacts/12/show", translate, "Hermes CRM")).toBe(
      "Contacts · Hermes CRM",
    );
  });

  it("names the dashboard on / and nowhere else", () => {
    expect(documentTitleFor("/", translate, "Hermes CRM")).toBe(
      "Dashboard · Hermes CRM",
    );
    expect(documentTitleFor("/nowhere", translate, "Hermes CRM")).toBe(
      "Hermes CRM",
    );
  });
});
