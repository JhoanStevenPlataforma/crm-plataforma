import { test } from "../studio";
import { CAST, stockCatalogue, setBaseCurrency } from "./scene";

/**
 * Tutorial 2 of the quotation flow: a price list, and products priced in it.
 *
 * Goal: a new user can create a list and put prices in it.
 * Starts from: three products in the catalogue, no price list.
 * Ends with: "Lista general 2026" holding two prices.
 */
test.use({ eyebrow: "Manual · Cotizaciones" });

test("configurar-una-lista-de-precios", async ({
  studio,
  createProduct,
  taxRateByCode,
}) => {
  const { page, director } = studio;
  await setBaseCurrency();
  await stockCatalogue({ createProduct, taxRateByCode } as never);

  const addPrice = async (
    product: { name: string; sku: string },
    price: string,
  ) => {
    await director.click(page.getByLabel("Producto", { exact: true }));
    await director.click(
      page.getByRole("option", { name: `${product.name} (${product.sku})` }),
    );
    await director.type(
      page.getByLabel("Precio unitario", { exact: true }),
      price,
    );
    await director.click(page.getByRole("button", { name: "Añadir precio" }));
  };

  await studio.open(
    "/",
    "Configurar una lista de precios",
    "Crea una lista y define a qué precio se vende cada producto.",
  );

  await director.step(
    "Abre Listas de precios, en el menú Ventas.",
    async () => {
      await director.click(
        page.getByRole("link", { name: "Listas de precios", exact: true }),
      );
    },
  );

  await director.step('Pulsa "Nueva lista de precios".', async () => {
    await director.click(
      page.getByRole("link", { name: "Nueva lista de precios" }),
    );
  });

  await director.step(
    "Dale un código y un nombre. La moneda es la de sus precios.",
    async () => {
      await director.type(page.getByLabel("Código *"), CAST.priceList.code);
      await director.type(page.getByLabel("Nombre *"), CAST.priceList.name);
      await director.highlight(page.getByLabel("Moneda *"), 1200);
    },
  );

  await director.step(
    "Guarda la lista: ahora puedes agregarle precios.",
    async () => {
      await director.click(page.getByRole("button", { name: "Guardar" }));
      await page.getByRole("button", { name: "Añadir precio" }).waitFor();
      await director.scrollTo(
        page.getByRole("button", { name: "Añadir precio" }),
      );
    },
  );

  await director.step(
    'En "Precios", elige un producto, escribe su precio y pulsa "Añadir precio".',
    async () => {
      await addPrice(CAST.products.kit, "420000");
    },
  );

  await director.step(
    "Repite por cada producto que quieras vender con esta lista.",
    async () => {
      await addPrice(CAST.products.maintenance, "1150000");
    },
  );

  await director.step(
    "Cada precio queda guardado al añadirlo. Puedes quitarlo con la X.",
    async () => {
      await director.highlight(
        page.getByRole("row", { name: new RegExp(CAST.products.kit.name) }),
        1700,
      );
    },
  );

  await director.outro(
    "La lista está lista: aparecerá al crear una cotización, con estos precios.",
  );
});
