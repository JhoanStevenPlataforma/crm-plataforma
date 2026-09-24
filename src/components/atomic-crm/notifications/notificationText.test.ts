import { describe, expect, it } from "vitest";

import { i18nProvider } from "../providers/commons/i18nProvider";
import { notificationText } from "./notificationText";

/**
 * The seam between a database that knows WHAT happened and a client that knows
 * the language of whoever is reading (quotes §13.6 #18).
 *
 * Run against the REAL catalogues rather than a stub translator: the failure
 * this guards against is a key the database writes and no catalogue defines,
 * and a stub would answer for every key ever invented.
 */
const translateIn =
  (locale: string) =>
  async (): Promise<
    (key: string, options?: Record<string, unknown>) => string
  > => {
    await i18nProvider.changeLocale(locale);
    return (key, options) => i18nProvider.translate(key, options ?? {});
  };

const accepted = {
  title: "Q-2026-00042 was accepted",
  body: "Clara Cliente accepted version 2",
  message_key: "crm.notifications.quote.accepted",
  message_params: {
    number: "Q-2026-00042",
    actor: "Clara Cliente",
    version: "2",
  },
};

describe("notificationText", () => {
  it("renders a quote notification in Spanish, not in the English the row carries", async () => {
    const translate = await translateIn("es")();

    const text = notificationText(accepted, translate);

    expect(text.title).toBe("Q-2026-00042 fue aceptada");
    expect(text.body).toBe("Clara Cliente aceptó la versión 2");
  });

  it("renders the same row in French", async () => {
    const translate = await translateIn("fr")();

    const text = notificationText(accepted, translate);

    expect(text.title).toBe("Q-2026-00042 a été accepté");
    expect(text.body).toBe("Clara Cliente a accepté la version 2");
  });

  it("names a customer who did not sign, in the reader's language", async () => {
    // The database leaves `actor` null on purpose: "The customer" is itself a
    // sentence, and a database that writes it has chosen a language for
    // everybody.
    const translate = await translateIn("es")();

    const text = notificationText(
      {
        ...accepted,
        message_params: { ...accepted.message_params, actor: null },
      },
      translate,
    );

    expect(text.body).toBe("El cliente aceptó la versión 2");
  });

  it("translates the loss reason with the same words the customer was offered", async () => {
    const translate = await translateIn("es")();

    const text = notificationText(
      {
        title: "Q-2026-00042 was declined",
        body: "Clara Cliente declined: delivery_time",
        message_key: "crm.notifications.quote.rejected",
        message_params: {
          number: "Q-2026-00042",
          actor: "Clara Cliente",
          reason_code: "delivery_time",
        },
      },
      translate,
    );

    expect(text.title).toBe("Q-2026-00042 fue rechazada");
    expect(text.body).toBe("Clara Cliente la rechazó: Tiempo de entrega");
    // The raw constraint value must never reach a reader.
    expect(text.body).not.toContain("delivery_time");
  });

  it("quotes a customer's own words instead of translating them", async () => {
    // A comment's excerpt is DATA. The catalogue defines no body for it, so the
    // row's own text is what shows — in whatever language the customer wrote.
    const translate = await translateIn("es")();

    const text = notificationText(
      {
        title: "Q-2026-00042: Clara Cliente wrote on the quotation",
        body: "¿Pueden dividir el pago en dos trimestres?",
        message_key: "crm.notifications.quote.commented",
        message_params: { number: "Q-2026-00042", actor: "Clara Cliente" },
      },
      translate,
    );

    expect(text.title).toBe(
      "Q-2026-00042: Clara Cliente escribió en la cotización",
    );
    expect(text.body).toBe("¿Pueden dividir el pago en dos trimestres?");
  });

  it("shows no body for a notification whose title says everything", async () => {
    const translate = await translateIn("es")();

    const text = notificationText(
      {
        title: "Q-2026-00042 was opened by the customer",
        body: null,
        message_key: "crm.notifications.quote.viewed",
        message_params: { number: "Q-2026-00042" },
      },
      translate,
    );

    expect(text.title).toBe("Q-2026-00042: el cliente abrió la cotización");
    expect(text.body).toBe("");
  });

  it("leaves a task reminder exactly as the row wrote it", async () => {
    // Every reminder ever written, and every row from before the column
    // existed: no key, so the English columns ARE the text.
    const translate = await translateIn("es")();

    const text = notificationText(
      {
        title: "Call Ana about the renewal",
        body: "She asked to be called back on Thursday",
        message_key: null,
        message_params: null,
      },
      translate,
    );

    expect(text.title).toBe("Call Ana about the renewal");
    expect(text.body).toBe("She asked to be called back on Thursday");
  });

  it("falls back to the row's English when a key is missing from the catalogue", async () => {
    // A notification the database can write and the client cannot name must
    // still say something — never the bare key.
    const translate = await translateIn("es")();

    const text = notificationText(
      {
        title: "Something happened",
        body: "and here is what",
        message_key: "crm.notifications.quote.not_a_real_key",
        message_params: {},
      },
      translate,
    );

    expect(text.title).toBe("Something happened");
    expect(text.body).toBe("and here is what");
  });
});
