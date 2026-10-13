import type { Locator, Page } from "@playwright/test";

import { test } from "./promoStudio";

/**
 * The promotional film (docs/video/guion-promocional.md): problem, solution,
 * demonstration, benefits, trust and a closing slate.
 *
 * It shows the local development database as it is. A form on screen is
 * either a record that already exists, opened in its edit screen, or -- the
 * new task -- one filled in under the cover and never saved: nothing is
 * typed, saved, sent or accepted on camera. The one thing it leaves behind is
 * a "viewed" event on the quotation whose customer page it opens, because
 * that is what opening that page does.
 *
 * Each shot ends on the second written next to it; `until` IS the storyboard.
 */

/** The records of the local stack the film is shot on. */
const RECORDS = {
  lead: 3, // Irene Salas, Vitalab: qualified, 85 points
  draftQuote: 13, // a draft with its lines, in the editor
  sentQuote: 36, // "Evento montaje": quoted in EUR, valued in COP, link live
  acceptedQuote: 12, // "Automatizacion Helios": accepted by the customer
  wonDeal: 8, // the deal that acceptance moved to Won
} as const;

/** The task shown ready to be saved. Its contact is one of the local stack. */
const TASK = {
  title: "Demo del portal para Helios Energia",
  description: "Mostrar la presentación y resolver dudas antes de la firma.",
  contact: "Beatriz Cano",
  type: "Demo",
  priority: "High",
} as const;

/** The library report the film opens: two dimensions, one stacked chart. */
/** The conversation `conversation.promo.ts` wrote on the sent quotation. */
const CHAT = {
  question: "¿El montaje incluye el desmontaje al terminar el evento?",
  answer:
    "Sí, Alicia: el desmontaje está incluido en los dos días. Quedó detallado en la versión 2.",
} as const;

const REPORT = "Valor por etapa y comercial";

/** A local date some days from now, as a `datetime-local` field takes it. */
const inDays = (days: number, time: string): string => {
  const date = new Date(Date.now() + days * 86_400_000);
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${time}`;
};

const SLATE = {
  scattered: `
    <div class="chips">
      <span class="chip" style="--x:58%;--y:16%;--fx:-240px;--fy:160px;--dx:70px;--dy:-46px;--r:-4deg;--at:200ms">Hoja de cálculo</span>
      <span class="chip" style="--x:74%;--y:36%;--fx:-360px;--fy:60px;--dx:96px;--dy:-10px;--r:3deg;--at:650ms">Correo</span>
      <span class="chip" style="--x:60%;--y:56%;--fx:-200px;--fy:-80px;--dx:60px;--dy:44px;--r:-2deg;--at:1100ms">Chat</span>
      <span class="chip" style="--x:78%;--y:70%;--fx:-380px;--fy:-180px;--dx:84px;--dy:60px;--r:5deg;--at:1550ms">PDF adjunto</span>
      <span class="chip" style="--x:52%;--y:80%;--fx:-120px;--fy:-220px;--dx:20px;--dy:70px;--r:-5deg;--at:2000ms">Notas sueltas</span>
    </div>
    <div class="kicker fade" style="--at:2300ms">¿Te suena?</div>
    <h1 class="rise" style="--at:2500ms">Tu venta vive en <span class="amber">cinco lugares.</span></h1>
  `,
  pains: `
    <div class="kicker fade">Y entonces</div>
    <div><span class="pain rise" style="--at:200ms;--dim:2900ms">Nadie sabe en qué quedó cada oportunidad.<i></i></span></div>
    <div><span class="pain rise" style="--at:3000ms;--dim:5900ms">La cotización viaja en PDF y se le pierde el rastro.<i></i></span></div>
    <div><span class="pain rise" style="--at:6000ms">El seguimiento depende de la memoria.</span></div>
  `,
  brand: (logo: string) => `
    <div class="brand fade">${logo ? `<img src="${logo}" alt="">` : ""}</div>
    <div class="kicker fade" style="--at:150ms">La solución</div>
    <h1 class="rise" style="--at:250ms">Hermes CRM</h1>
    <div class="rule fade" style="--at:700ms"></div>
    <p class="rise" style="--at:800ms">Del primer contacto a la cotización aceptada. Para equipos comerciales.</p>
  `,
  benefits: `
    <div class="kicker fade">Lo que tu equipo gana</div>
    <div class="benefit rise" style="--at:200ms"><b>✓</b>Información centralizada</div>
    <div class="benefit rise" style="--at:1200ms"><b>✓</b>Seguimiento de cada oportunidad</div>
    <div class="benefit rise" style="--at:2200ms"><b>✓</b>Cotizaciones con evidencia</div>
  `,
  closing: (logo: string) => `
    <div class="brand fade">${logo ? `<img src="${logo}" alt="">` : ""}</div>
    <h1 class="rise" style="--at:200ms">Hermes <span class="amber">CRM</span></h1>
    <div class="rule fade" style="--at:700ms"></div>
    <p class="rise" style="--at:800ms">La venta completa, en un solo lugar.</p>
  `,
};

test.use({ kicker: "Hermes CRM" });

test("hermes-crm-promo", async ({ studio }) => {
  const { page, director, promo } = studio;

  const heading = (name: string | RegExp) => (target: Page) =>
    target.getByRole("heading", { name });
  const text = (value: string | RegExp) => (target: Page) =>
    target.getByText(value);
  /** A change of screen inside a shot, with no cover: the app's own. */
  const go = async (hash: string, ready: Locator) => {
    await page.evaluate((next) => {
      window.location.hash = next;
    }, hash);
    await ready.first().waitFor({ state: "visible" });
  };

  // Backstage, under the cover the film opens on: the dashboard the brand
  // slate will lift on, set to the year so its figures are the year's.
  await promo.load({ url: "/#/", ready: text("Pipeline por etapa") });
  await page.getByRole("radio", { name: "Este año" }).click();
  const logo = await page
    .locator('img[src*="logo"]')
    .first()
    .getAttribute("src")
    .catch(() => null);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await promo.slate(SLATE.scattered, { isInstant: true });
  await page.evaluate(() =>
    (
      window as unknown as { __promo: { cover: (c: null) => void } }
    ).__promo.cover(null),
  );
  promo.start();

  // 1. Opening.
  await promo.shot({
    name: "1-apertura",
    until: 8,
    narration:
      "Una hoja de cálculo, el correo, un PDF, un chat. ¿Dónde está hoy tu venta?",
  });

  // 2. The problem.
  await promo.slate(SLATE.pains);
  await promo.shot({
    name: "2-problema",
    until: 17,
    narration:
      "Cuando la información está repartida, las oportunidades se enfrían y nadie puede reconstruir qué pasó.",
  });

  // 3. The product.
  await promo.slate(SLATE.brand(logo ?? ""));
  await promo.shot({
    name: "3a-marca",
    until: 21,
    narration: "Hermes CRM.",
  });
  await promo.clearSlate();
  await promo.shot(
    {
      name: "3b-panel",
      until: 26,
      headline: "Todo tu proceso comercial, en un solo lugar.",
      narration:
        "Reúne todo el proceso comercial de tu equipo en un solo lugar.",
    },
    async () => {
      await promo.pause(900);
      await promo.zoomAt(880, 400, 1.12);
    },
  );

  // 4. The demonstration: one sale, from the prospect to the signature.
  await promo.shot(
    {
      name: "4a-prospectos",
      until: 32,
      headline: "Cada prospecto, calificado y con responsable.",
      narration:
        "Cada prospecto llega con su origen, su puntuación y un responsable.",
      screen: { url: "/#/leads", ready: text("Leads calificados") },
    },
    async () => {
      await director.highlight(
        page.getByRole("columnheader", { name: /Puntuación/ }),
        1000,
      );
      await go(`#/leads/${RECORDS.lead}`, page.getByLabel("Puntuación"));
      await promo.pause(400);
      await director.highlight(page.getByLabel("Puntuación"), 1100);
    },
  );

  await promo.shot(
    {
      name: "4b-pipeline",
      until: 37,
      headline: "Todo tu pipeline, etapa por etapa.",
      narration: "Las oportunidades avanzan en un tablero, etapa por etapa.",
      screen: { url: "/#/deals", ready: text("Onboarding Nova") },
    },
    async () => {
      await promo.pause(700);
      await promo.zoomAt(900, 420, 1.12);
    },
  );

  const newTask = page.getByRole("dialog", { name: "Crear tarea" });
  await promo.shot(
    {
      name: "4c-tarea",
      until: 43,
      headline: "Crea la tarea: qué, con quién y para cuándo.",
      narration:
        "Cada oportunidad tiene su próximo paso: una tarea con responsable, fecha y prioridad.",
      screen: { url: "/#/tasks?scope=all", ready: heading("Tareas") },
      // The form is shown as somebody left it, ready to be saved: it is
      // filled in under the cover and never submitted.
      backstage: async () => {
        await page.getByRole("button", { name: "Añadir tarea" }).click();
        await newTask.getByLabel("Título").fill(TASK.title);
        await newTask.getByLabel("Descripción").fill(TASK.description);
        await newTask.getByRole("combobox", { name: "Contacto" }).click();
        await page.keyboard.type(TASK.contact.split(" ")[0]);
        await page.getByRole("option", { name: TASK.contact }).first().click();
        await newTask
          .getByLabel("Fecha de vencimiento")
          .fill(inDays(3, "10:00"));
        await newTask.getByRole("combobox", { name: "Tipo" }).click();
        await page.getByRole("option", { name: TASK.type }).click();
        await newTask.getByRole("combobox", { name: "Prioridad" }).click();
        await page.getByRole("option", { name: TASK.priority }).click();
        await newTask.getByRole("heading").click();
      },
    },
    async () => {
      await promo.pause(600);
      await director.highlight(
        newTask.getByLabel("Fecha de vencimiento"),
        1100,
      );
      await director.pointAt(newTask.getByRole("button", { name: "Guardar" }));
    },
  );

  await promo.shot(
    {
      name: "4d-agenda",
      until: 47,
      headline: "Y síguelas en lista, tablero o calendario.",
      narration:
        "Las tareas del equipo se siguen en lista, tablero o calendario.",
      screen: {
        url: "/#/tasks?view=calendar&scope=all",
        ready: text(/de 20\d\d/),
      },
    },
    async () => {
      await promo.pause(800);
      await director.highlight(page.getByRole("tablist").first(), 1200);
    },
  );

  await promo.shot(
    {
      name: "4e-cotizar",
      until: 54,
      headline: "Cotiza desde tu catálogo. Totales al instante.",
      narration:
        "Se cotiza desde el catálogo y la lista de precios, con los totales calculados al momento.",
      screen: {
        url: `/#/quotes/${RECORDS.draftQuote}`,
        ready: (target) => target.getByLabel("Título"),
      },
    },
    async () => {
      // The form as it was saved, then the document it produces.
      await promo.pause(600);
      await director.highlight(page.getByText("Lista de precios").first(), 800);
      await director.click(page.getByText("Ver documento"));
      const total = page.getByText("Total", { exact: true }).first();
      await total.waitFor();
      await promo.pause(400);
      await director.highlight(total, 1200);
    },
  );

  let customerLink = "";
  await promo.shot(
    {
      name: "4f-monedas",
      until: 59,
      headline: "En cualquier moneda, con su tasa de cambio.",
      headlineAt: "top",
      narration:
        "En pesos, dólares o euros, con la tasa aplicada y su fecha a la vista.",
      screen: {
        url: `/#/quotes/${RECORDS.sentQuote}/show`,
        ready: text("Tasa de cambio aplicada"),
      },
    },
    async () => {
      customerLink = await page
        .getByRole("textbox", { name: "Enlace para el cliente" })
        .inputValue();
      const rate = page.getByText("Tasa de cambio aplicada").first();
      await director.scrollTo(rate);
      await promo.zoomAt(770, 450, 1.22);
      await director.highlight(rate, 1400);
    },
  );

  await promo.shot(
    {
      name: "4g-cliente",
      until: 64,
      headline: "Tu cliente la abre desde un enlace. Sin cuenta.",
      narration:
        "Tu cliente la abre en un enlace, con la presentación de tu empresa. Sin crear una cuenta.",
      screen: {
        url: customerLink,
        ready: (target) =>
          target.getByRole("button", { name: "Ver cotización directamente" }),
      },
    },
    async () => {
      await promo.pause(900);
      await director.click(
        page.getByRole("button", { name: "Ver cotización directamente" }),
      );
      await page.getByRole("article").first().waitFor();
    },
  );

  // The conversation is the one `conversation.promo.ts` wrote: a question
  // from the customer's page and the rep's shared answer.
  await promo.shot(
    {
      name: "4h-chat",
      until: 69,
      headline: "Pregunta ahí mismo. El comercial le responde.",
      narration:
        "Si tiene una duda la escribe en la misma cotización, y el comercial le responde en ese hilo.",
    },
    async () => {
      await page.getByText(CHAT.question).first().waitFor();
      await promo.pause(300);
      await director.highlight(page.getByText(CHAT.question).first(), 1300);
      await director.highlight(page.getByText(CHAT.answer).first(), 1500);
    },
  );

  await promo.shot(
    {
      name: "4i-versiones",
      until: 73,
      headline: "Y ve cada versión de la propuesta.",
      narration:
        "Cada cambio es una versión nueva, y el cliente puede consultarlas todas desde el mismo enlace.",
    },
    async () => {
      await director.click(page.getByText(/Versión \d+/).first());
      await page.getByText("Versiones de esta cotización").waitFor();
      await promo.pause(1300);
    },
  );

  await promo.shot(
    {
      name: "4j-aceptar",
      until: 76,
      headline: "Cuando está de acuerdo, acepta.",
      narration: "Y cuando está de acuerdo, acepta desde ahí.",
    },
    async () => {
      await page.keyboard.press("Escape");
      const accept = page.getByRole("button", { name: "Aceptar", exact: true });
      await director.scrollTo(accept);
      await director.highlight(accept, 1200);
    },
  );

  await promo.shot(
    {
      name: "4k-revisar",
      until: 82,
      headline: "¿Cambios? El comercial revisa y emite otra versión.",
      narration:
        "Para el comercial, cambiar la oferta es revisar: se emite una versión nueva y la anterior queda guardada, con la conversación al lado.",
      screen: {
        url: `/#/quotes/${RECORDS.sentQuote}/show`,
        ready: (target) => target.getByRole("button", { name: "Revisar" }),
      },
    },
    async () => {
      await director.highlight(
        page.getByRole("button", { name: "Revisar" }),
        1000,
      );
      await director.highlight(
        page.getByRole("button", { name: /Versión 1/ }).first(),
        1100,
      );
      await director.scrollTo(page.getByText(CHAT.answer).first());
    },
  );

  await promo.shot(
    {
      name: "4l-respuesta",
      until: 87,
      headline: "Aceptó. Queda la evidencia: quién, cuándo y cuánto.",
      headlineAt: "top",
      narration:
        "Cuando acepta, queda la evidencia: quién firmó, cuándo y a qué cifra.",
      screen: {
        url: `/#/quotes/${RECORDS.acceptedQuote}/show`,
        ready: text("Respuesta del cliente"),
      },
    },
    async () => {
      await promo.pause(500);
      await director.zoomTo(page.getByText("Firmada por").first(), 1.3);
    },
  );

  await promo.shot(
    {
      name: "4m-ganada",
      until: 93,
      headline: "Y la oportunidad pasó a Ganada. Sola.",
      narration:
        "Y el CRM se entera solo: la oportunidad pasa a ganada, con su historia escrita.",
      screen: {
        url: `/#/deals/${RECORDS.wonDeal}/show`,
        ready: heading("Automatizacion Helios"),
      },
    },
    async () => {
      const moved = page
        .getByText("Movida automáticamente: el cliente aceptó la cotización")
        .first();
      await promo.pause(900);
      await director.scrollTo(moved);
      // Framed, not ringed: the line sits in a dialog that scrolls on its own.
      await promo.zoomAt(700, 380, 1.3);
    },
  );

  // 5. What the team gets out of it.
  // The reports: a library, one answer, how it is built, how it leaves.
  await promo.shot(
    {
      name: "5b-informes",
      until: 97,
      headline: "Informes listos para cada pregunta.",
      narration:
        "Una biblioteca de informes ya armados: pipeline, ventas, prospectos y productividad.",
      screen: { url: "/#/reports", ready: text(REPORT) },
    },
    async () => {
      await promo.pause(1100);
      await director.pointAt(page.getByText(REPORT).first());
    },
  );

  await promo.shot(
    {
      name: "5c-informe",
      until: 101,
      headline: "Quién lleva qué, y en qué etapa.",
      narration: "Cada informe responde una pregunta con un gráfico.",
    },
    async () => {
      await director.click(page.getByText(REPORT).first());
      await page.getByRole("button", { name: "Configurar" }).waitFor();
      await page.getByText("Lucia Fernandez").first().waitFor();
    },
  );

  await promo.shot(
    {
      name: "5d-constructor",
      until: 106,
      headline: "O arma el tuyo: qué medir y cómo agruparlo.",
      narration:
        "O se arma uno propio: qué entidad, qué métricas, cómo agruparlas y en qué periodo.",
    },
    async () => {
      await director.click(page.getByRole("button", { name: "Configurar" }));
      await page.getByText("Agrupar por").first().waitFor();
      await director.highlight(page.getByText("Métricas").first(), 1000);
      await director.highlight(page.getByText("Agrupar por").first(), 1000);
    },
  );

  await promo.shot(
    {
      name: "5e-exportar",
      until: 109,
      headline: "Y llévatelo en CSV o en PDF.",
      narration: "Y se exporta a CSV o a PDF.",
    },
    async () => {
      await director.highlight(page.getByRole("button", { name: "CSV" }), 900);
      await director.highlight(page.getByRole("button", { name: "PDF" }), 900);
    },
  );

  await promo.shot(
    {
      name: "5f-equipos",
      until: 114,
      headline: "Cada equipo, contra su meta.",
      narration: "Y cada equipo, frente al objetivo de su periodo.",
      screen: {
        url: "/#/teams-dashboard",
        ready: text("Objetivo, pipeline y ganado por equipo"),
      },
    },
    async () => {
      await promo.pause(800);
      await director.highlight(page.getByText("Cumplimiento").first(), 1200);
    },
  );

  await promo.slate(SLATE.benefits);
  await promo.shot(
    {
      name: "5g-beneficios",
      until: 119,
      narration:
        "Información en un solo lugar, seguimiento de cada oportunidad y cotizaciones con respaldo.",
    },
    async () => {
      // The next screen loads behind the slate, so it lifts on a page ready.
      await promo.pause(400);
      await promo.reset();
      await promo.load({ url: "/#/sales", ready: heading("Usuarios") });
    },
  );

  // 6. Why it can be trusted.
  await promo.shot(
    {
      name: "6a-roles",
      until: 123,
      headline: "Cada persona ve lo que le corresponde.",
      narration:
        "Con roles y permisos: cada comercial ve sus registros; los responsables, todo.",
    },
    async () => {
      await promo.clearSlate();
      await promo.pause(300);
      const role = page.getByText("Responsable de ventas").first();
      await promo.zoomAt(900, 380, 1.15);
      await director.highlight(role, 1100);
    },
  );

  await promo.shot(
    {
      name: "6b-correo",
      until: 129,
      headline: "Compártela por correo, sin salir del CRM.",
      narration: "La cotización se comparte por correo desde el mismo CRM.",
      screen: {
        url: `/#/quotes/${RECORDS.sentQuote}/show`,
        ready: (target) =>
          target.getByRole("button", { name: "Enviar por correo" }),
      },
    },
    async () => {
      await director.click(
        page.getByRole("button", { name: "Enviar por correo" }),
      );
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Asunto").waitFor();
      await promo.pause(250);
      // On the message itself: who it goes to, the template, what it says.
      await promo.zoomAt(800, 720, 1.3);
      // The dialog is fixed to a body the zoom transforms, so where it lands
      // cannot be computed beforehand: measure the notice above the message
      // and carry the frame past it.
      // The notice is only there when no mail provider is configured.
      const notice = await dialog
        .getByText(/Modo simulado/)
        .boundingBox({ timeout: 800 })
        .catch(() => null);
      if (notice && notice.y + notice.height > 0) {
        await promo.zoomAt(
          800,
          720 + (notice.y + notice.height + 28) / 1.3,
          1.3,
        );
      }
    },
  );

  // 7. The close. No call to action: this cut is shown to the team itself.
  await promo.slate(SLATE.closing(logo ?? ""));
  await promo.finish();
  await promo.shot({
    name: "7-cierre",
    until: 133,
    narration: "Hermes CRM. La venta completa, en un solo lugar.",
  });
});
