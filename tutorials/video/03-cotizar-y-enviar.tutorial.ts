import { CAST, openForBusiness, setBaseCurrency } from "../quotes/scene";
import { test } from "../studio";

/**
 * Part 3 of the product video (docs/video/estructura-video.md, module 3,
 * steps 3.7 to 3.11): the quotation, from the deal to the customer's inbox.
 *
 * Goal: a viewer sees a quotation written from the deal, issued, mailed, and
 * the deal following it on the board.
 * Starts from: the catalogue, its price list, and the customer and deal the
 * previous part ended on.
 * Ends with: the board, the deal carrying its quotation and its total.
 */
test.use({ eyebrow: "Hermes CRM · Video del producto" });

const CONTACT_EMAIL = "carolina@ferreteriadelnorte.test";

test("video-03-cotizar-y-enviar", async ({
  studio,
  baseURL,
  createProduct,
  createPriceList,
  createCompany,
  createContact,
  createDeal,
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
    {
      dealAmount: 2_500_000,
      dealStage: "proposal-sent",
      contactEmail: CONTACT_EMAIL,
    },
  );
  const kit = CAST.products.kit;
  const maintenance = CAST.products.maintenance;
  const validUntil = new Date(Date.now() + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const addLine = async (
    product: { name: string; sku: string },
    quantity: string,
  ) => {
    await director.click(page.getByLabel("Producto", { exact: true }));
    await director.click(
      page.getByRole("option", { name: `${product.name} (${product.sku})` }),
    );
    await director.type(page.getByLabel("Cantidad", { exact: true }), quantity);
    await director.click(page.getByRole("button", { name: "Agregar línea" }));
  };

  await studio.open(
    `/deals/${business.deal.id}/show`,
    "Cotizar y enviar",
    "La cotización nace de la oportunidad, se emite y llega al cliente.",
  );

  await director.step(
    'Desde la oportunidad, pulsa "Nueva cotización": la empresa y la oportunidad ya vienen puestas.',
    async () => {
      await director.click(
        page.getByRole("link", { name: "Nueva cotización" }),
      );
      await page.getByLabel("Lista de precios *").waitFor();
    },
  );

  await director.step(
    "Elige la lista de precios y hasta cuándo es válida la oferta.",
    async () => {
      await director.click(page.getByLabel("Lista de precios *"));
      await director.click(
        page.getByRole("option", { name: new RegExp(CAST.priceList.name) }),
      );
      await director.fill(page.getByLabel("Válida hasta"), validUntil);
      await director.click(page.getByRole("button", { name: "Guardar" }));
      await page.getByRole("button", { name: "Agregar línea" }).waitFor();
      await director.scrollTo(
        page.getByRole("button", { name: "Agregar línea" }),
      );
    },
  );

  await director.step(
    "Agrega los productos del catálogo: el precio sale de la lista.",
    async () => {
      await addLine(kit, "3");
      await addLine(maintenance, "1");
    },
  );

  await director.step("Cada línea admite su propio descuento.", async () => {
    const discount = page.getByLabel(`Descuento de ${kit.name}`);
    await director.type(discount, "5");
    await discount.press("Tab");
    await director.pause(700);
  });

  await director.step(
    "Subtotal, descuento, impuesto y total se calculan solos, y el servidor los vuelve a calcular al guardar.",
    async () => {
      const totals = page.locator("dl").filter({ hasText: "Subtotal" });
      await director.scrollTo(totals);
      await director.zoomTo(totals, 1.3);
      await director.pause(1800);
      await director.zoomOut();
    },
    { captionAt: "top" },
  );

  await director.step(
    "Escribe las condiciones comerciales y guarda el borrador.",
    async () => {
      await director.scrollTo(page.getByLabel("Condiciones"));
      await director.type(
        page.getByLabel("Condiciones"),
        "Pago a 30 días. Instalación incluida.",
      );
      await director.click(page.getByRole("button", { name: "Guardar" }));
    },
  );

  await director.step(
    "Este es el documento, tal como lo verá el cliente.",
    async () => {
      await director.scrollTo(
        page.getByRole("link", { name: "Ver documento" }),
      );
      await director.click(page.getByRole("link", { name: "Ver documento" }));
      await page.getByRole("article").waitFor();
      await director.pause(1600);
    },
  );

  await director.step('Para emitirla, pulsa "Enviar".', async () => {
    await director.click(
      page.getByRole("button", { name: "Enviar", exact: true }),
    );
    await page.getByRole("dialog").waitFor();
  });

  await director.step(
    "Al confirmar, la versión queda congelada: nadie puede cambiar lo que el cliente recibió.",
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

  await director.step(
    "El CRM entrega el enlace del cliente: uno solo y permanente, para esta versión y las que vengan.",
    async () => {
      await director.highlight(
        page.getByRole("textbox", { name: "Enlace para el cliente" }),
        1800,
      );
      await director.click(page.getByRole("button", { name: "Listo" }));
    },
  );

  await director.step(
    'El enlace también puede salir por correo, sin dejar el CRM: "Enviar por correo".',
    async () => {
      const send = page.getByRole("button", { name: "Enviar por correo" });
      await director.scrollTo(send);
      await director.click(send);
      await page.getByRole("dialog").getByLabel("Asunto").waitFor();
    },
  );

  await director.step(
    "El mensaje sale de una plantilla, dirigido al contacto de la cotización, con el número y el total ya escritos.",
    async () => {
      const dialog = page.getByRole("dialog");
      await director.highlight(dialog.getByLabel("Asunto"), 1500);
      await director.highlight(dialog.getByLabel("Mensaje"), 1800);
    },
  );

  await director.step(
    "La vista previa muestra el correo como llegará.",
    async () => {
      const dialog = page.getByRole("dialog");
      await director.click(dialog.getByRole("tab", { name: "Vista previa" }));
      await dialog.locator("iframe").waitFor();
      await director.pause(1800);
    },
  );

  await director.step(
    "Esta instalación de ejemplo no tiene proveedor de correo: el mensaje queda registrado como simulado, y el CRM lo dice.",
    async () => {
      const dialog = page.getByRole("dialog");
      await director.click(
        dialog.getByRole("button", { name: "Enviar", exact: true }),
      );
      const simulated = dialog.getByText("Simulado, no enviado");
      await simulated.waitFor();
      await director.highlight(simulated, 2000);
      await director.click(
        dialog.getByRole("button", { name: "Cerrar" }).first(),
      );
    },
  );

  await director.step(
    "En el tablero, la tarjeta ya lleva su cotización, y el importe de la oportunidad es ahora el total cotizado.",
    async () => {
      await page.goto(`${baseURL}/#/deals`);
      const card = page
        .locator('[data-rfd-droppable-id="proposal-sent"]')
        .getByText(CAST.deal);
      await card.waitFor();
      await director.zoomTo(card, 1.3);
      await director.highlight(card, 2200);
      await director.zoomOut();
    },
  );

  await director.chapter(
    "El cliente",
    "La cotización ya está en sus manos. Esto es lo que ve, sin cuenta ni contraseña.",
  );
});
