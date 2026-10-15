import { test } from "../studio";
import { draftQuote, openForBusiness, setBaseCurrency } from "./scene";

/**
 * Tutorial 5 of the quotation flow: sending a quotation.
 *
 * Goal: a new user can issue a quotation, hand its link to the customer and
 * knows what the customer sees and can do there.
 * Starts from: a draft quotation with its lines.
 * Ends with: the customer's page, on the quotation.
 */
test.use({ eyebrow: "Manual · Cotizaciones" });

test("enviar-una-cotizacion-al-cliente", async ({
  studio,
  createProduct,
  createPriceList,
  createCompany,
  createContact,
  createDeal,
  createQuote,
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
  const quote = await draftQuote(createQuote, business, presenterId);

  await studio.open(
    "/quotes",
    "Enviar una cotización al cliente",
    "Emite la cotización, comparte su enlace y conoce lo que ve el cliente.",
  );

  await director.step("Abre la cotización que vas a enviar.", async () => {
    await director.click(
      page.getByRole("row", { name: new RegExp(quote.quote_number) }),
    );
    await page.getByRole("article").waitFor();
  });

  await director.step(
    "Revisa el documento: productos, totales y condiciones.",
    async () => {
      await director.highlight(page.getByRole("article"), 2000);
    },
  );

  await director.step('Cuando esté lista, pulsa "Enviar".', async () => {
    await director.click(
      page.getByRole("button", { name: "Enviar", exact: true }),
    );
    await page.getByRole("dialog").waitFor();
  });

  await director.step(
    "Al confirmar, esta versión queda congelada: el cliente siempre verá lo que enviaste.",
    async () => {
      await director.click(
        page
          .getByRole("dialog")
          .getByRole("button", { name: "Enviar", exact: true }),
      );
      await page
        .getByRole("textbox", { name: "Enlace para el cliente" })
        .waitFor();
    },
  );

  const link = page.getByRole("textbox", { name: "Enlace para el cliente" });
  const address = await link.inputValue();

  await director.step(
    "Este es el enlace de la cotización. Cópialo y envíalo por correo o chat.",
    async () => {
      await director.highlight(link, 1400);
      await director.click(
        page.getByRole("button", { name: "Copiar el enlace" }),
      );
      await director.click(page.getByRole("button", { name: "Listo" }));
    },
  );

  await director.step(
    "Así ve el cliente el enlace: primero la presentación de tu empresa.",
    async () => {
      await page.goto(address);
      await page
        .getByRole("button", { name: "Ver cotización directamente" })
        .waitFor();
      await director.pause(1600);
    },
  );

  await director.step(
    "Y después la cotización, con todo su detalle.",
    async () => {
      await director.click(
        page.getByRole("button", { name: "Ver cotización directamente" }),
      );
      await page.getByRole("article").waitFor();
      await director.pause(1400);
    },
  );

  await director.step(
    "Desde ahí puede aceptarla, rechazarla o imprimirla.",
    async () => {
      const accept = page.getByRole("button", { name: "Aceptar", exact: true });
      await director.scrollTo(accept);
      await director.highlight(accept, 1300);
      await director.highlight(
        page.getByRole("button", { name: "Rechazar", exact: true }),
        1300,
      );
    },
  );

  await director.step(
    "También puede escribirte preguntas y comentarios, sin salir de la página.",
    async () => {
      const message = page.getByLabel("Su mensaje");
      await director.scrollTo(message);
      await director.highlight(message, 1800);
    },
  );

  await director.outro(
    "La cotización está enviada. Su respuesta llegará al CRM y moverá la oportunidad.",
  );
});
