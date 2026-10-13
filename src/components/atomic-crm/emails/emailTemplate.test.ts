import type { EmailTemplate } from "../types";
import {
  defaultTemplate,
  emailMessageText,
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

describe("emailMessageText", () => {
  const variables = {
    quote_number: "Q-2026-00007",
    issuer_name: "Acme",
    issue_date: "2026-10-08",
  };

  it("fills an automation's stored template, the way the dispatcher sends it", () => {
    const text = emailMessageText({
      origin: "automation",
      language: "en",
      subject: "Reminder: quotation {{quote_number}} from {{issuer_name}}",
      body_text: "Issued on {{issue_date}}. {{quote_link}}",
      variables,
    });

    expect(text).toEqual({
      subject: "Reminder: quotation Q-2026-00007 from Acme",
      body: "Issued on October 8, 2026. {{quote_link}}",
    });
  });

  it("leaves a person's message exactly as they wrote it", () => {
    const text = emailMessageText({
      origin: "manual",
      language: "en",
      subject: "About {{quote_number}}",
      body_text: "Literal {{issuer_name}}",
      variables,
    });

    expect(text).toEqual({
      subject: "About {{quote_number}}",
      body: "Literal {{issuer_name}}",
    });
  });

  it("fills a timeline event, which carries a subject and no body", () => {
    expect(
      emailMessageText({
        origin: "automation",
        subject: "{{quote_number}}",
        variables,
      }),
    ).toEqual({ subject: "Q-2026-00007", body: "" });
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
    // What an automation sends: offered, but never what the dialog opens on.
    template({ id: 6, key: "quote_accepted", language: "en" }),
  ];

  it("are its own scope and the generic ones, active only", () => {
    expect(templatesFor(templates, "quote").map((t) => t.id)).toEqual([
      1, 2, 3, 6,
    ]);
    expect(templatesFor(templates, "contact").map((t) => t.id)).toEqual([3]);
  });

  it("open on the template for sharing a quotation, in the user's language", () => {
    // The automation's template first: the order must not decide.
    const offered = templatesFor(templates, "quote").sort(
      (a, b) =>
        Number(b.key === "quote_accepted") - Number(a.key === "quote_accepted"),
    );

    expect(defaultTemplate(offered, "quote", "en")?.id).toBe(2);
    expect(defaultTemplate(offered, "quote", "fr")?.id).toBe(1);
    expect(defaultTemplate(offered, "contact", "es")).toBeUndefined();
  });
});
