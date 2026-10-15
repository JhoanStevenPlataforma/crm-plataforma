import { writeFile } from "node:fs/promises";
import path from "node:path";

import { expect } from "@playwright/test";

import { OUTPUT_DIR, test } from "./promoStudio";

/**
 * Not part of the film: writes, once, the conversation the film shows on the
 * quotation "Evento montaje" -- a question from the customer on their page
 * and the answer of the rep, shared with them.
 *
 * It WRITES to the local database, with the owner's agreement (2026-10-12),
 * and by the product's own rule the customer's comment moves the quotation's
 * deal to "In negotiation". Each message is written only when it is not
 * there yet, so it is safe to run again.
 *
 *   npm run promo:record -- -g conversacion
 */
export const CONVERSATION = {
  quote: 36,
  question: "¿El montaje incluye el desmontaje al terminar el evento?",
  answer:
    "Sí, Alicia: el desmontaje está incluido en los dos días. Quedó detallado en la versión 2.",
} as const;

test("conversacion", async ({ studio }) => {
  const { page, api } = studio;
  const uncover = () =>
    page.evaluate(() =>
      (
        window as unknown as { __promo: { cover: (c: null) => void } }
      ).__promo.cover(null),
    );
  const still = async (name: string) => {
    await page.waitForTimeout(1500);
    const base = path.join(OUTPUT_DIR, "conversacion", name);
    await page.screenshot({ path: `${base}.png` });
    await writeFile(`${base}.yml`, await page.locator("body").ariaSnapshot());
  };

  await page.goto(`/#/quotes/${CONVERSATION.quote}/show`);
  await uncover();
  const link = await page
    .getByRole("textbox", { name: "Enlace para el cliente" })
    .inputValue();
  const { data: written } = await api
    .from("quote_comments")
    .select("body")
    .eq("quote_id", CONVERSATION.quote);
  const has = (body: string) =>
    (written ?? []).some((comment) => comment.body === body);

  if (!has(CONVERSATION.question)) {
    await page.goto(link);
    await uncover();
    await page
      .getByRole("button", { name: "Ver cotización directamente" })
      .click();
    await page.getByLabel("Su mensaje").fill(CONVERSATION.question);
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    await page.getByText(CONVERSATION.question).first().waitFor();
    await page.goto(`/#/quotes/${CONVERSATION.quote}/show`);
    await uncover();
  }

  if (!has(CONVERSATION.answer)) {
    await page.getByText(CONVERSATION.question).first().waitFor();
    const reply = page.getByPlaceholder("Escribe un comentario…");
    await reply.fill(CONVERSATION.answer);
    await page.getByRole("switch").last().check();
    // The button says who will read it: shared, it goes to the customer.
    await page.getByRole("button", { name: "Enviar al cliente" }).click();
    await expect(reply).toHaveValue("");
  }

  // What the film will find: the thread in the CRM, then on the customer's
  // page, and the version selector open.
  await page.getByText(CONVERSATION.answer).first().scrollIntoViewIfNeeded();
  await still("crm-hilo");
  await page.goto(link);
  await uncover();
  await page
    .getByRole("button", { name: "Ver cotización directamente" })
    .click();
  await page.getByText(CONVERSATION.answer).first().waitFor();
  await still("portal-hilo");
  await page
    .getByText(/Versión 2/)
    .first()
    .click();
  await still("portal-versiones");
});
