import { test } from "../studio";
import {
  CAST,
  draftQuote,
  openForBusiness,
  sentQuote,
  setBaseCurrency,
} from "./scene";

/**
 * Tutorial 4 of the quotation flow: following a quotation.
 *
 * Goal: a new user can find a quotation, read its status and follow the sale
 * on the deals board. (There is no quotations board: quotations are a list,
 * and the board is the deals', where each card carries its latest quotation.)
 * Starts from: one quotation sent on a deal, one still a draft.
 * Ends with: the deals board, the deal moved by its quotation.
 */
test.use({ eyebrow: "Manual · Cotizaciones" });

test("dar-seguimiento-a-una-cotizacion", async ({
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
  const sent = await sentQuote(createQuote, issueQuote, business, presenterId);
  await draftQuote(
    createQuote,
    { ...business, deal: { id: null } } as never,
    presenterId,
    "Ampliación de bodega",
  );

  await studio.open(
    "/",
    "Dar seguimiento a una cotización",
    "Encuentra una cotización, lee su estado y sigue la venta en el tablero.",
  );

  await director.step(
    "En Cotizaciones están todas, de la más reciente a la más antigua.",
    async () => {
      await director.click(
        page.getByRole("link", { name: "Cotizaciones", exact: true }),
      );
      await page.getByRole("table").waitFor();
    },
  );

  await director.step(
    'La columna "Estado" dice en qué punto está cada una.',
    async () => {
      await director.highlight(
        page.getByRole("columnheader", { name: "Estado" }),
        1500,
      );
      await director.highlight(
        page.getByRole("row", { name: new RegExp(sent.quote_number) }),
        1700,
      );
    },
  );

  // The status filter, not the search box: the list's search is broken as of
  // this recording (it answers 400 for any term) and a film must not teach a
  // control that does not work. Put the search back here once it is fixed.
  await director.step(
    "Filtra por estado para ver solo las que te interesan.",
    async () => {
      await director.click(
        page.getByRole("combobox").filter({ hasText: "Cualquier estado" }),
      );
      await director.click(page.getByRole("option", { name: "Sent" }));
      await director.pause(900);
    },
  );

  await director.step(
    "Abre una cotización para ver su documento, sus versiones y la respuesta del cliente.",
    async () => {
      await director.click(
        page.getByRole("row", { name: new RegExp(sent.quote_number) }),
      );
      await page.getByRole("article").waitFor();
      await director.highlight(page.getByText("Versiones").first(), 1500);
    },
  );

  await director.step(
    "El tablero de Oportunidades muestra el avance de cada venta.",
    async () => {
      await director.click(
        page.getByRole("link", { name: "Oportunidades", exact: true }),
      );
      await page.getByText(CAST.deal).first().waitFor();
    },
  );

  await director.step(
    "Cada tarjeta lleva su última cotización y el estado en que está.",
    async () => {
      const card = page.getByText(CAST.deal).first();
      await director.zoomTo(card, 1.5);
      await director.highlight(page.getByText(sent.quote_number).first(), 2000);
      await director.zoomOut();
    },
  );

  await director.step(
    "La oportunidad avanzó sola al enviar la cotización, y volverá a moverse cuando el cliente responda.",
  );

  await director.outro(
    "Con la lista y el tablero sabes siempre en qué va cada cotización.",
  );
});
