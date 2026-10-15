import { test } from "../studio";
import { CAST, setBaseCurrency } from "./scene";

/**
 * Tutorial 1 of the quotation flow: a product enters the catalogue.
 *
 * Goal: a new user can add a product with its price and tax.
 * Starts from: an empty catalogue, on the dashboard.
 * Ends with: "Kit de instalación" in the product list.
 */
test.use({ eyebrow: "Manual · Cotizaciones" });

test("crear-un-producto", async ({ studio }) => {
  const { page, director } = studio;
  const product = CAST.products.kit;
  await setBaseCurrency();

  await studio.open(
    "/",
    "Crear un producto",
    "Agrega al catálogo un producto con su precio de lista y su impuesto.",
  );

  await director.step("Abre Productos, en el menú Ventas.", async () => {
    await director.click(
      page.getByRole("link", { name: "Productos", exact: true }),
    );
  });

  await director.step('Pulsa "Nuevo producto".', async () => {
    await director.click(page.getByRole("link", { name: "Nuevo producto" }));
  });

  await director.step(
    "Escribe el SKU y el nombre con los que tu equipo lo reconoce.",
    async () => {
      await director.type(page.getByLabel("SKU *"), product.sku);
      await director.type(page.getByLabel("Nombre *"), product.name);
    },
  );

  await director.step(
    "El tipo y la unidad dicen qué es y cómo se vende.",
    async () => {
      await director.highlight(page.getByLabel("Tipo *"), 1100);
      await director.highlight(page.getByLabel("Unidad *"), 1100);
    },
  );

  await director.step(
    "Indica el precio de lista y elige el impuesto que aplica.",
    async () => {
      await director.type(
        page.getByLabel("Precio de lista *"),
        String(product.list_price),
      );
      await director.click(page.getByLabel("Impuesto"));
      await director.click(page.getByRole("option", { name: "IVA 19%" }));
    },
  );

  await director.step("Guarda el producto.", async () => {
    await director.click(page.getByRole("button", { name: "Guardar" }));
  });

  await director.step(
    "El producto ya está en el catálogo, con su precio y su impuesto.",
    async () => {
      await director.highlight(
        page.getByRole("row", { name: new RegExp(product.name) }),
        1800,
      );
    },
  );

  await director.outro(
    "El producto está en el catálogo y ya se puede agregar a una lista de precios.",
  );
});
