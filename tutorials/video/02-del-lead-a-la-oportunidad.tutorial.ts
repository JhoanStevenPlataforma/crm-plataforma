import type { Locator, Page } from "@playwright/test";

import { CAST, setBaseCurrency } from "../quotes/scene";
import { test } from "../studio";

/**
 * Part 2 of the product video (docs/video/estructura-video.md, module 3,
 * steps 3.1 to 3.6): a prospect becomes a customer with an open deal, and the
 * deal earns its move to the next stage.
 *
 * Goal: a viewer sees a lead captured, converted in one step, and the board
 * refusing a move the deal has not earned before allowing it.
 * Starts from: an empty CRM.
 * Ends with: the deal in "Propuesta enviada", its reason on record.
 */
test.use({ eyebrow: "Hermes CRM · Video del producto" });

/**
 * A drag a person could have made: pressed, carried in small moves, dropped.
 * The board ignores a pointer that teleports.
 */
const drag = async (page: Page, card: Locator, column: Locator) => {
  // The board redraws when a dialog over it closes; a card measured during
  // that redraw is picked up where it no longer is.
  await page.waitForTimeout(900);
  const from = await card.boundingBox();
  const to = await column.boundingBox();
  if (!from || !to) throw new Error("Nothing to drag, or nowhere to drop it.");
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + 140 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 6, { steps: 6 });
  await page.mouse.move(end.x, end.y, { steps: 36 });
  await page.waitForTimeout(250);
  await page.mouse.up();
};

test("video-02-del-lead-a-la-oportunidad", async ({ studio }) => {
  const { page, director } = studio;
  await setBaseCurrency();
  const deal = CAST.deal;
  const task = "Llamada de diagnóstico";
  const proposalColumn = page.locator(
    '[data-rfd-droppable-id="proposal-sent"]',
  );

  await studio.open(
    "/leads",
    "Del lead a la oportunidad",
    "Un prospecto se registra, se convierte en cliente y su oportunidad avanza.",
  );

  await director.step(
    'Todo empieza con un lead: un prospecto que aún no es cliente. Pulsa "Nuevo lead".',
    async () => {
      await director.click(
        page.getByRole("link", { name: "Nuevo lead" }).first(),
      );
    },
  );

  await director.step("Registra quién es y cómo contactarlo.", async () => {
    await director.type(
      page.getByLabel("Nombre", { exact: true }),
      CAST.contact.first_name,
    );
    await director.type(page.getByLabel("Apellidos"), CAST.contact.last_name);
    await director.type(
      page.getByLabel("Correo electrónico"),
      "carolina@ferreteriadelnorte.test",
    );
  });

  await director.step(
    "Su empresa aún no está en el CRM: basta con escribir el nombre.",
    async () => {
      await director.type(
        page.getByLabel("Nombre de la empresa", { exact: false }),
        CAST.company,
      );
    },
  );

  await director.step(
    "Califícalo: de dónde llegó y qué tan prometedor es, de 0 a 100.",
    async () => {
      await director.click(page.getByLabel("Origen"));
      await director.click(page.getByRole("option").first());
      await director.type(page.getByLabel("Puntuación"), "80");
      await director.click(page.getByRole("button", { name: "Guardar" }));
      await page.getByRole("button", { name: "Convertir" }).waitFor();
    },
  );

  await director.step(
    'Cuando el prospecto está listo para comprar, pulsa "Convertir".',
    async () => {
      await director.click(page.getByRole("button", { name: "Convertir" }));
      await page.getByRole("dialog").waitFor();
    },
  );

  await director.step(
    "Un solo paso crea la empresa y el contacto. Marca la casilla para abrir también la oportunidad.",
    async () => {
      const dialog = page.getByRole("dialog");
      await director.click(dialog.getByLabel("Crear también una oportunidad"));
      await director.type(dialog.getByLabel("Nombre"), deal);
      await director.type(dialog.getByLabel("Importe"), "2500000");
      await director.click(
        dialog.getByRole("button", { name: "Convertir", exact: true }),
      );
      await page.getByRole("heading", { name: "Carolina Rojas" }).waitFor();
    },
  );

  await director.step(
    "El CRM abre el contacto recién creado, ya enlazado a su empresa.",
    async () => {
      await director.highlight(
        page.getByRole("link", { name: CAST.company }).first(),
        1800,
      );
    },
  );

  await director.step(
    "El lead queda como convertido: no puede convertirse dos veces.",
    async () => {
      await director.click(
        page.getByRole("link", { name: "Leads", exact: true }),
      );
      const converted = page.getByText("Convertido").first();
      await converted.waitFor();
      await director.highlight(converted, 1800);
    },
  );

  await director.step(
    "En el tablero, cada columna es una etapa. Intenta mover la oportunidad a la siguiente.",
    async () => {
      await director.click(
        page.getByRole("link", { name: "Oportunidades", exact: true }),
      );
      const card = page.getByText(deal).first();
      await card.waitFor();
      await drag(page, card, proposalColumn);
      await page.getByRole("dialog").waitFor();
    },
  );

  await director.step(
    "El CRM no lo permite todavía: una oportunidad avanza cuando hay trabajo hecho, no solo una intención.",
    async () => {
      const hint = page
        .getByRole("dialog")
        .getByText("Completa una tarea de esta oportunidad");
      await hint.waitFor();
      await director.zoomTo(hint, 1.25);
      await director.pause(2200);
      await director.zoomOut();
      await director.click(
        page.getByRole("dialog").getByRole("button", { name: "Cancelar" }),
      );
    },
  );

  await director.step(
    "Abre la oportunidad y registra el trabajo: una tarea.",
    async () => {
      await director.click(page.getByText(deal).first());
      await director.click(page.getByRole("button", { name: "Añadir tarea" }));
      await director.type(page.getByLabel("Título *"), task);
      await director.click(page.getByRole("button", { name: "Guardar" }));
      await page.getByText(task).first().waitFor();
    },
  );

  await director.step(
    "Hecha la llamada, márcala como completada.",
    async () => {
      await director.click(
        page.getByRole("checkbox", { name: "Marcar como completada" }).first(),
      );
      await director.pause(900);
      await director.click(
        page.getByRole("button", { name: "Cerrar" }).first(),
      );
    },
  );

  await director.step(
    "Ahora sí: el tablero acepta el movimiento y pide el motivo.",
    async () => {
      const card = page.getByText(deal).first();
      await card.waitFor();
      await drag(page, card, proposalColumn);
      await page.getByLabel("¿Por qué pasa a esta etapa?").waitFor();
    },
  );

  await director.step(
    "El motivo es obligatorio y admite adjuntos: dentro de tres meses, el tablero seguirá explicándose solo.",
    async () => {
      const dialog = page.getByRole("dialog");
      await director.type(
        dialog.getByLabel("¿Por qué pasa a esta etapa?"),
        "Diagnóstico hecho por teléfono. Piden propuesta formal esta semana.",
      );
      await director.click(
        dialog.getByRole("button", { name: "Mover la oportunidad" }),
      );
      await proposalColumn.getByText(deal).waitFor();
    },
  );

  await director.step(
    "El cambio queda en la historia de la oportunidad: quién, cuándo y por qué.",
    async () => {
      await director.click(page.getByText(deal).first());
      const reason = page.getByText("Diagnóstico hecho por teléfono").first();
      await reason.waitFor();
      await director.scrollTo(reason);
      await director.highlight(reason, 2000);
    },
  );

  await director.step(
    "Y desde la misma ficha se cotiza: la cotización nace enlazada a su oportunidad.",
    async () => {
      const quoteLink = page.getByRole("link", { name: "Nueva cotización" });
      await director.scrollTo(quoteLink);
      await director.highlight(quoteLink, 2000);
    },
  );

  await director.chapter(
    "La cotización",
    "Con la oportunidad en marcha, llega el momento de poner precio.",
  );
});
