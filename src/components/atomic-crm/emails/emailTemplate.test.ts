import type { EmailTemplate } from "../types";
import {
  defaultTemplate,
  fillTemplate,
  templatesFor,
  unresolvedVariables,
} from "./emailTemplate";

const template = (overrides: Partial<EmailTemplate>): EmailTemplate => ({
  id: 1,
  key: "quote_share",
  name: "Quotation",
  subject: "s",
  body: "b",
  scope: "quote",
  category: "transactional",
  language: "es",
  is_active: true,
  is_system: true,
  ...overrides,
});

describe("fillTemplate", () => {
  const variables = {
    customer_name: "Ana Compras",
    quote_number: "Q-2026-00007",
    issue_date: "2026-10-08",
    total: 1234567.5,
    currency: "COP",
    valid_until: "",
  };

  it("replaces every variable the record has, formatting the date and the total", () => {
    const text = fillTemplate(
      "Hola {{customer_name}}: {{quote_number}} del {{ issue_date }} por {{total}} {{currency}}",
      variables,
      "en",
    );

    expect(text).toBe(
      "Hola Ana Compras: Q-2026-00007 del October 8, 2026 por 1,234,567.50 COP",
    );
  });

  it("leaves the quotation link as its marker: only the server knows it", () => {
    expect(fillTemplate("Ver: {{quote_link}}", variables, "es")).toBe(
      "Ver: {{quote_link}}",
    );
  });

  it("turns a variable with no value into nothing, not into braces", () => {
    expect(
      fillTemplate("Vence {{valid_until}} / {{deal_name}}.", variables, "es"),
    ).toBe("Vence  / .");
  });

  it("does not treat a value as a template", () => {
    expect(
      fillTemplate("{{customer_name}}", { customer_name: "{{total}}" }, "es"),
    ).toBe("{{total}}");
  });
});

describe("unresolvedVariables", () => {
  it("allows the link marker in the text of a quotation, and nowhere else", () => {
    expect(unresolvedVariables("Asunto", "Ver {{quote_link}}", true)).toEqual(
      [],
    );
    expect(unresolvedVariables("Asunto", "Ver {{quote_link}}", false)).toEqual([
      "quote_link",
    ]);
    expect(unresolvedVariables("Ver {{quote_link}}", "Hola", true)).toEqual([
      "quote_link",
    ]);
  });

  it("names each leftover variable once", () => {
    expect(
      unresolvedVariables("{{total}}", "{{total}} y {{currency}}", true),
    ).toEqual(["total", "currency"]);
  });
});

describe("the templates a record offers", () => {
  const templates = [
    template({ id: 1, language: "es" }),
    template({ id: 2, language: "en" }),
    template({ id: 3, scope: "generic", key: "greeting" }),
    template({ id: 4, scope: "deal", key: "deal_followup" }),
    template({ id: 5, is_active: false }),
  ];

  it("are its own scope and the generic ones, active only", () => {
    expect(templatesFor(templates, "quote").map((t) => t.id)).toEqual([
      1, 2, 3,
    ]);
    expect(templatesFor(templates, "contact").map((t) => t.id)).toEqual([3]);
  });

  it("open on the quotation template in the user's language", () => {
    const offered = templatesFor(templates, "quote");

    expect(defaultTemplate(offered, "quote", "en")?.id).toBe(2);
    expect(defaultTemplate(offered, "quote", "fr")?.id).toBe(1);
    expect(defaultTemplate(offered, "contact", "es")).toBeUndefined();
  });
});
