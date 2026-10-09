import { test } from "../studio";
import { openForBusiness, sentQuote, setBaseCurrency } from "./scene";

/**
 * Tutorial 7 of the quotation flow: the conversation on a quotation.
 *
 * Goal: a new user can write to the customer from the quotation, tell an
 * internal note from a shared message, and find the customer's reply.
 * Starts from: a quotation sent to the customer.
 * Ends with: the customer's reply read, in the quotation's conversation.
 */
test.use({ eyebrow: "Manual · Cotizaciones" });

test("conversar-con-el-cliente", async ({
  studio,
  baseURL,
  createProduct,
  createPriceList,
  createCompany,
  createContact,
  createDeal,
  createQuote,
  issueQuote,
  taxRateByCode,
}) => {
  const { page, director, presenterId } = studio;
  await setBaseCurrency();
  const business = await openForBusiness(
    {
      createProduct,
      createPriceList,
      createCompany,
      createContact,
      createDeal,
      taxRateByCode,
    } as never,
    presenterId,
  );
  const quote = await sentQuote(createQuote, issueQuote, business, presenterId);
  const comment = page.getByPlaceholder("Escribe un comentario…");

  await studio.open(
    `/quotes/${quote.id}/show`,
    "Conversar con el cliente",
    "Resuelve dudas y negocia desde la misma cotización.",
  );

  await director.step(
    "La conversación está debajo del documento de la cotización.",
    async () => {
      await director.scrollTo(comment);
      await director.highlight(page.getByText("Conversación").first(), 1500);
    },
  );

  await director.step(
    "Por defecto un comentario es interno: solo lo ve tu equipo.",
    async () => {
      await director.type(
        comment,
        "El cliente evalúa otra oferta. Hay margen para un 5 %.",
      );
      await director.click(
        page.getByRole("button", { name: "Comentar", exact: true }),
      );
      await page.getByText("Interno").first().waitFor();
    },
  );

  await director.step(
    'Para escribirle al cliente, activa "Compartir con el cliente".',
    async () => {
      await director.click(page.getByLabel("Compartir con el cliente"));
    },
  );

  await director.step(
    "Escribe el mensaje y envíalo: el cliente lo leerá en su enlace.",
    async () => {
      await director.type(
        comment,
        "Hola Carolina, ¿tienes alguna duda sobre la propuesta?",
      );
      await director.click(
        page.getByRole("button", { name: "Enviar al cliente" }),
      );
      await page.getByText("Compartido con el cliente").first().waitFor();
    },
  );

  await director.step(
    "El cliente ve tu mensaje junto a la cotización y puede responder.",
    async () => {
      await page.goto(`${baseURL}/#/quote#${quote.token}`);
      await director.click(
        page.getByRole("button", { name: "Ver cotización directamente" }),
      );
      const message = page.getByLabel("Su mensaje");
      await message.waitFor();
      await director.scrollTo(message);
      await director.type(
        message,
        "¿Pueden incluir la capacitación del equipo?",
      );
      await director.type(page.getByLabel("Su nombre"), "Carolina Rojas");
      await director.click(
        page.getByRole("button", { name: "Enviar mensaje" }),
      );
      await director.pause(1200);
    },
  );

  await director.step(
    'En el CRM, la lista de cotizaciones avisa que hay una respuesta "sin leer".',
    async () => {
      await page.goto(`${baseURL}/#/quotes`);
      const unread = page.getByText("1 sin leer");
      await unread.waitFor();
      await director.zoomTo(unread, 1.5);
      await director.highlight(unread, 1700);
      await director.zoomOut();
    },
  );

  await director.step(
    "Abre la cotización: la respuesta del cliente está en la conversación.",
    async () => {
      await director.click(
        page.getByRole("row", { name: new RegExp(quote.quote_number) }),
      );
      const reply = page.getByText(
        "¿Pueden incluir la capacitación del equipo?",
      );
      await reply.waitFor();
      await director.scrollTo(reply);
      await director.highlight(reply, 1800);
    },
  );

  await director.step(
    "Responde, o márcala como leída para llevar el seguimiento.",
    async () => {
      await director.click(
        page.getByRole("button", { name: /Marcar 1 comentario/ }),
      );
    },
  );

  await director.outro(
    "Toda la negociación queda registrada en la cotización, a la vista del equipo.",
  );
});
