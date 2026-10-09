import { test } from "../studio";
import { CAST, openForBusiness, sentQuote, setBaseCurrency } from "./scene";

/**
 * Tutorial 6 of the quotation flow: changing a quotation already sent.
 *
 * Goal: a new user knows a sent quotation is never rewritten -- it is
 * revised into a new version -- and what the customer's link shows meanwhile.
 * Starts from: a quotation sent to the customer (version 1).
 * Ends with: version 2 sent, on the same link.
 */
test.use({ eyebrow: "Manual · Cotizaciones" });

test("editar-una-cotizacion-enviada", async ({
  studio,
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
  const kit = CAST.products.kit;

  await studio.open(
    "/quotes",
    "Editar una cotización",
    "Cambia una cotización ya enviada creando una nueva versión.",
  );

  await director.step("Abre la cotización que quieres cambiar.", async () => {
    await director.click(
      page.getByRole("row", { name: new RegExp(quote.quote_number) }),
    );
    await page.getByRole("article").waitFor();
  });

  await director.step(
    'Una cotización enviada no se reescribe. Para cambiarla, pulsa "Revisar".',
    async () => {
      await director.click(
        page.getByRole("button", { name: "Revisar", exact: true }),
      );
      await page.getByRole("dialog").waitFor();
    },
  );

  await director.step("Escribe el motivo del cambio y confirma.", async () => {
    await director.type(
      page.getByLabel("Motivo"),
      "El cliente pidió un kit adicional",
    );
    await director.click(page.getByRole("button", { name: "Confirmar" }));
    await page.getByRole("button", { name: /Versión 2/ }).waitFor();
  });

  await director.step(
    "Se creó la versión 2 en borrador. La versión 1 queda guardada tal como se envió.",
    async () => {
      await director.highlight(
        page.getByRole("button", { name: /Versión 2/ }),
        1500,
      );
      await director.highlight(
        page.getByRole("button", { name: /Versión 1/ }),
        1500,
      );
    },
  );

  await director.step(
    'Pulsa "Editar" y cambia productos, cantidades o precios.',
    async () => {
      await director.click(
        page.getByRole("link", { name: "Editar", exact: true }),
      );
      const quantity = page.getByLabel(`Cantidad de ${kit.name}`);
      await quantity.waitFor();
      await director.scrollTo(quantity);
      await director.type(quantity, "4");
      await quantity.press("Tab");
      await director.pause(900);
    },
  );

  await director.step(
    "Mientras tanto, el cliente sigue viendo la versión anterior en su enlace.",
    async () => {
      const notice = page.getByText(/está en preparación/);
      await director.scrollTo(notice);
      await director.highlight(notice, 1900);
    },
  );

  await director.step(
    'Cuando termines, pulsa "Enviar" y confirma.',
    async () => {
      const send = page.getByRole("button", { name: "Enviar", exact: true });
      await director.scrollTo(send);
      await director.click(send);
      await director.click(
        page
          .getByRole("dialog")
          .getByRole("button", { name: "Enviar", exact: true }),
      );
      await page
        .getByRole("textbox", { name: "Enlace para el cliente" })
        .first()
        .waitFor();
    },
  );

  await director.step(
    "El enlace es el mismo de antes: el cliente verá la versión nueva y podrá consultar la anterior.",
    async () => {
      await director.highlight(
        page.getByRole("textbox", { name: "Enlace para el cliente" }).first(),
        1800,
      );
      await director.click(page.getByRole("button", { name: "Listo" }));
    },
  );

  await director.outro(
    "La versión 2 está enviada, y la versión 1 sigue en el historial.",
  );
});
