import { test } from "../studio";
import { CAST, openForBusiness, setBaseCurrency } from "./scene";

/**
 * Tutorial 3 of the quotation flow: a quotation, from blank to document.
 *
 * Goal: a new user can write a complete quotation.
 * Starts from: the catalogue, the price list and a customer.
 * Ends with: the quotation's document on screen.
 */
test.use({ eyebrow: "Manual · Cotizaciones" });

test("crear-una-cotizacion", async ({
  studio,
  createProduct,
  createPriceList,
  createCompany,
  createContact,
  createDeal,
  taxRateByCode,
}) => {
  const { page, director, presenterId } = studio;
  await setBaseCurrency();
  await openForBusiness(
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
    "/",
    "Crear una cotización",
    "Cliente, lista de precios, productos, cantidades y condiciones.",
  );

  await director.step(
    'Abre Cotizaciones y pulsa "Nueva cotización".',
    async () => {
      await director.click(
        page.getByRole("link", { name: "Cotizaciones", exact: true }),
      );
      await director.click(
        page.getByRole("link", { name: "Nueva cotización" }),
      );
    },
  );

  await director.step(
    "Ponle un título y elige la empresa a la que le cotizas.",
    async () => {
      await director.type(page.getByLabel("Título"), "Renovación anual 2026");
      await director.click(page.getByLabel("Empresa *"));
      await page.keyboard.type("Ferre", { delay: 60 });
      await director.click(page.getByRole("option", { name: CAST.company }));
    },
  );

  await director.step(
    "Elige la lista de precios: de ella salen los precios de las líneas.",
    async () => {
      await director.click(page.getByLabel("Lista de precios *"));
      await director.click(
        page.getByRole("option", { name: new RegExp(CAST.priceList.name) }),
      );
    },
  );

  await director.step(
    "Indica hasta cuándo es válida la oferta y guarda.",
    async () => {
      await director.fill(page.getByLabel("Válida hasta"), validUntil);
      await director.click(page.getByRole("button", { name: "Guardar" }));
      await page.getByRole("button", { name: "Agregar línea" }).waitFor();
      await director.scrollTo(
        page.getByRole("button", { name: "Agregar línea" }),
      );
    },
  );

  await director.step(
    'En "Líneas", elige un producto, la cantidad y pulsa "Agregar línea".',
    async () => {
      await addLine(kit, "3");
    },
  );

  await director.step(
    "Agrega los demás productos de la misma forma.",
    async () => {
      await addLine(maintenance, "1");
    },
  );

  await director.step(
    "Puedes cambiar la cantidad, el precio o el descuento de cada línea.",
    async () => {
      const discount = page.getByLabel(`Descuento de ${kit.name}`);
      await director.type(discount, "5");
      await discount.press("Tab");
      await director.pause(700);
    },
  );

  await director.step(
    "Los totales se recalculan solos: subtotal, descuento, impuesto y total.",
    async () => {
      const totals = page.locator("dl").filter({ hasText: "Subtotal" });
      await director.scrollTo(totals);
      await director.zoomTo(totals, 1.3);
      await director.pause(1600);
      await director.zoomOut();
    },
    { captionAt: "top" },
  );

  await director.step(
    "Escribe las condiciones comerciales y guarda.",
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
    '"Ver documento" muestra la cotización tal como la verá el cliente.',
    async () => {
      await director.scrollTo(
        page.getByRole("link", { name: "Ver documento" }),
      );
      await director.click(page.getByRole("link", { name: "Ver documento" }));
      await page.getByRole("article").waitFor();
      await director.pause(1500);
    },
  );

  await director.outro(
    "La cotización está guardada como borrador, lista para enviarla al cliente.",
  );
});
