import {
  CAST,
  openForBusiness,
  sentQuote,
  setBaseCurrency,
} from "../quotes/scene";
import { test } from "../studio";

/**
 * Part 5 of the product video (docs/video/estructura-video.md, module 3,
 * step 3.17, and the close): the alternative ending. The customer declines,
 * the deal is lost with its reason, and a new version reopens it.
 *
 * Goal: a viewer sees that a refusal is recorded with its reason, moves the
 * deal, and can be renegotiated at the same link.
 * Starts from: a quotation sent to the customer.
 * Ends with: the closing card of the whole video.
 */
test.use({ eyebrow: "Hermes CRM · Video del producto" });

const column = (stage: string) => `[data-rfd-droppable-id="${stage}"]`;

test("video-05-cuando-el-cliente-dice-no", async ({
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
    { dealAmount: 2_500_000, dealStage: "proposal-sent" },
  );
  const quote = await sentQuote(createQuote, issueQuote, business, presenterId);
  const kit = CAST.products.kit;

  await studio.open(
    `/quote#${quote.token}`,
    "Cuando el cliente dice que no",
    "El rechazo llega con su motivo, y la negociación sigue en el mismo enlace.",
  );

  await director.step(
    'Esta vez el cliente no está de acuerdo, y pulsa "Rechazar".',
    async () => {
      await director.click(
        page.getByRole("button", { name: "Ver cotización directamente" }),
      );
      const reject = page.getByRole("button", {
        name: "Rechazar",
        exact: true,
      });
      await reject.waitFor();
      await director.scrollTo(reject);
      await director.click(reject);
      await page.getByRole("dialog").waitFor();
    },
  );

  await director.step(
    "El CRM le pregunta por qué: precio, condiciones, tiempo de entrega, producto.",
    async () => {
      const dialog = page.getByRole("dialog");
      await director.click(dialog.getByRole("radio", { name: "Precio" }));
      await director.click(
        dialog.getByRole("button", { name: "Rechazar la cotización" }),
      );
      const notice = page.getByText("Su respuesta quedó registrada", {
        exact: false,
      });
      await notice.waitFor();
      await director.scrollTo(notice);
      await director.highlight(notice, 1800);
    },
  );

  await director.step(
    "En el CRM, la oportunidad pasó a Perdida. Nadie tuvo que moverla.",
    async () => {
      await page.goto(`${baseURL}/#/deals`);
      const card = page.locator(column("lost")).getByText(CAST.deal);
      await card.waitFor();
      await director.zoomTo(card, 1.3);
      await director.highlight(card, 2000);
      await director.zoomOut();
    },
  );

  await director.step(
    "Y la lista de cotizaciones dice por qué se perdió.",
    async () => {
      await page.goto(`${baseURL}/#/quotes`);
      const row = page.getByRole("row", {
        name: new RegExp(quote.quote_number),
      });
      await row.waitFor();
      await director.zoomTo(row, 1.2);
      await director.highlight(row, 2200);
      await director.zoomOut();
    },
  );

  await director.step(
    'Un rechazo no es el final. Abre la cotización y pulsa "Renegociar".',
    async () => {
      await director.click(
        page.getByRole("row", { name: new RegExp(quote.quote_number) }),
      );
      await page.getByRole("article").waitFor();
      await director.click(
        page.getByRole("button", { name: "Renegociar", exact: true }),
      );
      await page.getByRole("dialog").waitFor();
    },
  );

  await director.step(
    "Con el motivo escrito, nace la versión 2. La versión 1 queda guardada tal como se rechazó.",
    async () => {
      await director.type(
        page.getByLabel("Motivo"),
        "Rechazada por precio: se ofrece un 10 % en los kits.",
      );
      await director.click(page.getByRole("button", { name: "Confirmar" }));
      await page.getByRole("button", { name: /Versión 2/ }).waitFor();
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

  await director.step("Mejora la oferta en la versión nueva.", async () => {
    await director.click(
      page.getByRole("link", { name: "Editar", exact: true }),
    );
    const discount = page.getByLabel(`Descuento de ${kit.name}`);
    await discount.waitFor();
    await director.scrollTo(discount);
    await director.type(discount, "10");
    await discount.press("Tab");
    await director.pause(900);
  });

  await director.step(
    "Y envíala de nuevo: el cliente la encontrará en el enlace que ya tiene.",
    async () => {
      const send = page.getByRole("button", { name: "Enviar", exact: true });
      await director.scrollTo(send);
      await director.click(send);
      await director.click(
        page
          .getByRole("dialog")
          .getByRole("button", { name: "Enviar", exact: true }),
      );
      const link = page
        .getByRole("textbox", { name: "Enlace para el cliente" })
        .first();
      await link.waitFor();
      await director.highlight(link, 1800);
      await director.click(page.getByRole("button", { name: "Listo" }));
    },
  );

  await director.step(
    "La oportunidad que el rechazo había cerrado vuelve al tablero, en Propuesta enviada.",
    async () => {
      await page.goto(`${baseURL}/#/deals`);
      const card = page.locator(column("proposal-sent")).getByText(CAST.deal);
      await card.waitFor();
      await director.zoomTo(card, 1.3);
      await director.highlight(card, 2200);
      await director.zoomOut();
    },
  );

  await director.chapter(
    "En resumen",
    "Un lead se convirtió en cliente. Su oportunidad se trabajó, se cotizó y se respondió. Cada paso quedó escrito.",
  );

  await director.chapter(
    "Lo que conecta todo",
    "La tarea habilita el avance. La cotización mueve la oportunidad. El cliente responde desde un enlace, y el equipo lo ve.",
  );

  await director.outro(
    "Hermes CRM: la venta completa, con su evidencia, en un solo sistema.",
  );
});
