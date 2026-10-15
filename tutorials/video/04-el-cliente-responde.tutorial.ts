import {
  CAST,
  openForBusiness,
  sentQuote,
  setBaseCurrency,
} from "../quotes/scene";
import { test } from "../studio";

/**
 * Part 4 of the product video (docs/video/estructura-video.md, module 3,
 * steps 3.12 to 3.16): the customer answers, and the CRM
 * shows what that answer changed.
 *
 * Goal: a viewer sees the customer's page, a question, the acceptance, and
 * the deal won with the evidence of who accepted.
 * Starts from: the quotation the previous part sent.
 * Ends with: the quotation, on the evidence of its acceptance.
 */
test.use({ eyebrow: "Hermes CRM · Video del producto" });

const CUSTOMER = "Carolina Rojas";
const CUSTOMER_EMAIL = "carolina@ferreteriadelnorte.test";
const QUESTION = "¿La instalación incluye la visita técnica?";

test("video-04-el-cliente-responde", async ({
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
    {
      dealAmount: 2_500_000,
      dealStage: "proposal-sent",
      contactEmail: CUSTOMER_EMAIL,
    },
  );
  const quote = await sentQuote(createQuote, issueQuote, business, presenterId);

  await studio.open(
    `/quote#${quote.token}`,
    "El cliente responde",
    "Abre su enlace, pregunta, acepta. El CRM registra cada paso.",
  );

  await director.step(
    "El cliente abre el enlace y encuentra primero la presentación de la empresa.",
    async () => {
      await page
        .getByRole("button", { name: "Ver cotización directamente" })
        .waitFor();
      await director.pause(2200);
    },
  );

  await director.step(
    "Después, la cotización completa: productos, impuestos, total y condiciones.",
    async () => {
      await director.click(
        page.getByRole("button", { name: "Ver cotización directamente" }),
      );
      await page.getByRole("article").waitFor();
      await director.pause(1800);
    },
  );

  await director.step(
    "Si tiene una duda, la escribe ahí mismo. No necesita cuenta.",
    async () => {
      const message = page.getByLabel("Su mensaje");
      await director.scrollTo(message);
      await director.type(message, QUESTION);
      await director.type(page.getByLabel("Su nombre"), CUSTOMER);
      await director.click(
        page.getByRole("button", { name: "Enviar mensaje" }),
      );
      await page.getByText(QUESTION).first().waitFor();
    },
  );

  await director.step(
    'Y cuando está de acuerdo, pulsa "Aceptar".',
    async () => {
      const accept = page.getByRole("button", { name: "Aceptar", exact: true });
      await director.scrollTo(accept);
      await director.click(accept);
      await page.getByRole("dialog").waitFor();
    },
  );

  await director.step(
    "La aceptación nombra la versión y el total, y registra quién acepta y cuándo.",
    async () => {
      const dialog = page.getByRole("dialog");
      await director.type(dialog.getByLabel("Nombre completo"), CUSTOMER);
      await director.type(
        dialog.getByLabel("Correo electrónico"),
        CUSTOMER_EMAIL,
      );
      await director.click(
        dialog.getByLabel("Acepto esta cotización tal como fue emitida"),
      );
      await director.click(
        dialog.getByRole("button", { name: "Aceptar la cotización" }),
      );
      const notice = page.getByText("Su aceptación quedó registrada", {
        exact: false,
      });
      await notice.waitFor();
      await director.scrollTo(notice);
      await director.highlight(notice, 2000);
    },
  );

  await director.chapter(
    "De vuelta en el CRM",
    "Nadie tuvo que avisar: la respuesta del cliente ya movió todo lo demás.",
  );

  await director.step(
    "La oportunidad está en Ganada. La movió la aceptación, no una persona.",
    async () => {
      await page.goto(`${baseURL}/#/deals`);
      const card = page
        .locator('[data-rfd-droppable-id="won"]')
        .getByText(CAST.deal);
      await card.waitFor();
      await director.zoomTo(card, 1.3);
      await director.highlight(card, 2200);
      await director.zoomOut();
    },
  );

  await director.step(
    "Su historia cuenta cada paso: la cotización enviada, la pregunta del cliente y la aceptación.",
    async () => {
      await page.goto(`${baseURL}/#/deals/${business.deal.id}/show`);
      const accepted = page
        .getByText("Movida automáticamente: el cliente aceptó la cotización")
        .first();
      await accepted.waitFor();
      await director.scrollTo(accepted);
      await director.highlight(accepted, 2400);
    },
  );

  await director.step(
    "En la cotización, la respuesta del cliente queda como evidencia: quién firmó, cuándo, qué versión y a qué cifra.",
    async () => {
      await page.goto(`${baseURL}/#/quotes/${quote.id}/show`);
      const answer = page.getByText("Respuesta del cliente").first();
      await answer.waitFor();
      await director.scrollTo(answer);
      await director.highlight(answer, 2600);
    },
  );

  await director.step(
    "Y su pregunta está en la conversación, junto al documento que la motivó.",
    async () => {
      const question = page.getByText(QUESTION).first();
      await question.waitFor();
      await director.scrollTo(question);
      await director.highlight(question, 2200);
    },
  );

  await director.chapter(
    "¿Y si el cliente dice que no?",
    "Un rechazo también es una respuesta, y también queda escrito.",
  );
});
