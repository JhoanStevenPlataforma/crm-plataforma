import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import type { Shot } from "./promoDirector";
import { OUTPUT_DIR, test } from "./promoStudio";

/**
 * The walkthrough: one sale done for real, from the deal a rep opens to the
 * quotation its customer accepts, with both sides on screen.
 *
 * Unlike the promotional film, this one WRITES: it creates a deal and a
 * quotation in the local development database, issues it, exchanges two
 * messages and accepts it. That is its subject, and what the owner asked
 * for (2026-10-13). Nothing it creates can be deleted afterwards -- a
 * quotation that was issued is history -- so it is never run casually:
 *
 *   RECORRIDO=ensayo PROMO_REHEARSAL=1 TUTORIAL_REHEARSAL=1 \
 *     npm run promo:record -- -g recorrido      a fast pass, on a spare cast
 *   npm run promo:record -- -g recorrido        the film, on the final cast
 *
 * A rehearsal can be RESUMED: each scene opens its own screen from what the
 * scenes before it left in `recorrido-<cast>.json`, so a scene that broke is
 * fixed and run again without creating a second deal. The film itself is one
 * take and never resumes.
 */

interface Cast {
  company: string;
  contact: string;
  contactEmail: string;
  deal: string;
  quote: string;
}

const CASTS: Record<string, Cast> = {
  final: {
    company: "Everest Salud",
    contact: "Clara Serrano",
    contactEmail: "clara.serrano@everest.test",
    deal: "Convención anual Everest",
    quote: "Convención anual Everest 2027",
  },
  ensayo: {
    company: "Fenix Retail",
    contact: "Hugo Bermudez",
    contactEmail: "hugo.bermudez@fenixretail.test",
    deal: "Lanzamiento de temporada Fenix",
    quote: "Lanzamiento de temporada 2027",
  },
  reserva: {
    company: "Delta Seguros",
    contact: "Alberto Nunez",
    contactEmail: "alberto.nunez@deltaseg.test",
    deal: "Encuentro de agentes Delta",
    quote: "Encuentro de agentes Delta 2027",
  },
};

/** The catalogue of the local stack: a price list in pesos, quoted in dollars. */
const PRICE_LIST = /Plataforma Colombia/;
const QUOTE_CURRENCY = /USD/;
const PRODUCT = /Evento Montaje/;
const QUANTITY = "3";
const TERMS = "Pago a 30 días. Montaje y desmontaje incluidos.";
const QUESTION = "¿El precio incluye el montaje del escenario principal?";
const answerTo = (contact: string) =>
  `Sí, ${contact.split(" ")[0]}: el escenario principal está incluido en los tres días de montaje.`;

const REP = "El comercial";
const CUSTOMER = "El cliente";

const SLATE = {
  title: `
    <div class="kicker fade">Hermes CRM · Recorrido</div>
    <h1 class="rise" style="--at:200ms">De la oportunidad <span class="amber">al sí.</span></h1>
    <div class="rule fade" style="--at:700ms"></div>
    <p class="rise" style="--at:800ms">Una venta completa, del lado del comercial y del lado del cliente.</p>
  `,
  closing: (logo: string) => `
    <div class="brand fade">${logo ? `<img src="${logo}" alt="">` : ""}</div>
    <h1 class="rise" style="--at:200ms">Hermes <span class="amber">CRM</span></h1>
    <div class="rule fade" style="--at:700ms"></div>
    <p class="rise" style="--at:800ms">De la oportunidad a la cotización aceptada, en un solo lugar.</p>
  `,
};

interface State {
  done: string[];
  dealId?: number;
  quoteId?: number;
  link?: string;
}

const inDays = (days: number): string => {
  const date = new Date(Date.now() + days * 86_400_000);
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
};

test.use({ kicker: "Hermes CRM" });

test("recorrido", async ({ studio }) => {
  const { page, director, promo, api } = studio;
  const castName = process.env.RECORRIDO ?? "final";
  const cast = CASTS[castName];
  if (!cast) throw new Error(`No cast named ${castName}`);
  const isRehearsal = Boolean(process.env.PROMO_REHEARSAL);

  const stateFile = path.join(OUTPUT_DIR, `recorrido-${castName}.json`);
  const state: State =
    isRehearsal && existsSync(stateFile)
      ? JSON.parse(readFileSync(stateFile, "utf8"))
      : { done: [] };
  const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2));

  const column = (stage: string) =>
    page.locator(`[data-rfd-droppable-id="${stage}"]`);
  const text = (value: string | RegExp) => (target: Page) =>
    target.getByText(value);
  /** Picks an option of a select: opens it, then the option by its name. */
  const choose = async (field: Locator, option: string | RegExp) => {
    await director.click(field);
    await director.click(page.getByRole("option", { name: option }).first());
  };
  /** Picks a record in a search box: opens it, narrows it, takes the match. */
  const search = async (field: Locator, name: string) => {
    await director.click(field);
    await page.keyboard.type(name.split(" ")[0]);
    await director.click(page.getByRole("option", { name }).first());
  };

  /**
   * One scene: `seconds` is how long it is meant to hold, counted from its
   * cut; a scene that takes longer simply ends when its actions do.
   */
  const scene = async (
    shot: Omit<Shot, "until"> & { seconds: number },
    actions?: () => Promise<void>,
  ) => {
    if (state.done.includes(shot.name)) return;
    await promo.shot({ ...shot, until: promo.now() + shot.seconds }, actions);
    state.done.push(shot.name);
    save();
  };

  // Backstage: the board behind the title, and the logo for the last slate.
  await promo.load({ url: "/#/deals", ready: text("Oportunidades") });
  const logo = await page
    .locator('img[src*="logo"]')
    .first()
    .getAttribute("src")
    .catch(() => null);
  await promo.slate(SLATE.title, { isInstant: true });
  await page.evaluate(() =>
    (
      window as unknown as { __promo: { cover: (c: null) => void } }
    ).__promo.cover(null),
  );
  promo.start();

  await promo.shot({
    name: "0-titulo",
    until: 4.5,
    narration:
      "De la oportunidad al sí: una venta completa, del lado del comercial y del lado del cliente.",
  });
  await promo.clearSlate();

  // 1. The deal.
  await scene(
    {
      name: "1-oportunidad",
      seconds: 14,
      kicker: REP,
      headline: "Todo empieza con una oportunidad.",
      narration:
        "El comercial abre la oportunidad: el cliente, el importe estimado y la fecha en que espera cerrarla.",
      screen: { url: "/#/deals", ready: text("Nueva oportunidad") },
    },
    async () => {
      await promo.pause(700);
      await director.click(page.getByText("Nueva oportunidad").first());
      const form = page.getByRole("dialog");
      await director.fill(form.getByLabel("Nombre"), cast.deal);
      await search(
        form.getByRole("combobox", { name: "Empresa" }),
        cast.company,
      );
      await director.fill(form.getByLabel("Importe"), "3500000");
      await director.fill(
        form.getByLabel("Fecha prevista de cierre"),
        inDays(21),
      );
      await director.click(form.getByRole("button", { name: "Guardar" }));
      await page.getByText(cast.deal).first().waitFor();
      const { data } = await api
        .from("deals")
        .select("id")
        .eq("name", cast.deal)
        .order("id", { ascending: false })
        .limit(1)
        .single();
      state.dealId = data?.id;
    },
  );

  await scene(
    {
      name: "2-tablero",
      seconds: 5,
      kicker: REP,
      headline: "Ya está en el tablero, en su primera etapa.",
      narration: "La oportunidad aparece en el tablero, en su primera etapa.",
      screen: {
        url: "/#/deals",
        ready: (target) =>
          target
            .locator('[data-rfd-droppable-id="opportunity"]')
            .getByText(cast.deal),
      },
    },
    async () => {
      await promo.pause(500);
      await director.highlight(
        column("opportunity").getByText(cast.deal),
        2000,
      );
    },
  );

  // 2. The quotation, in a currency that is not its price list's.
  await scene(
    {
      name: "3-cotizacion",
      seconds: 17,
      kicker: REP,
      headline: "Desde la oportunidad, se cotiza.",
      narration:
        "Desde la misma oportunidad se crea la cotización. La lista de precios está en pesos, y el cliente la quiere en dólares.",
      screen: {
        url: `/#/deals/${state.dealId}/show`,
        ready: text("Nueva cotización"),
      },
    },
    async () => {
      await promo.pause(600);
      await director.click(page.getByText("Nueva cotización").first());
      await page.getByLabel("Título").waitFor();
      await director.fill(page.getByLabel("Título"), cast.quote);
      await search(
        page.getByRole("combobox", { name: "Contacto" }),
        cast.contact,
      );
      await choose(
        page.getByRole("combobox", { name: /Lista de precios/ }),
        PRICE_LIST,
      );
      await choose(
        page.getByRole("combobox", { name: /Moneda de la cotización/ }),
        QUOTE_CURRENCY,
      );
      await director.fill(page.getByLabel("Válida hasta"), inDays(30));
      await director.fill(page.getByLabel("Condiciones"), TERMS);
      await director.click(page.getByRole("button", { name: "Guardar" }));
      await page.getByRole("button", { name: "Agregar línea" }).waitFor();
      state.quoteId = Number(/quotes\/(\d+)/.exec(page.url())?.[1]);
    },
  );

  await scene(
    {
      name: "4-tasa",
      seconds: 16,
      kicker: REP,
      headline: "Precios en pesos, cotización en dólares.",
      headlineAt: "top",
      narration:
        "El CRM toma la tasa oficial del día, convierte el precio de la lista y calcula el total en dólares.",
      screen: {
        url: `/#/quotes/${state.quoteId}`,
        ready: (target) =>
          target.getByRole("button", { name: "Agregar línea" }),
      },
    },
    async () => {
      const rate = page.getByRole("region", { name: "Tasa de cambio" });
      await director.scrollTo(rate);
      const official = rate.getByRole("button", { name: "Usar oficial" });
      if (await official.isVisible().catch(() => false)) {
        await director.click(official);
      }
      await promo.pause(900);
      await director.highlight(rate, 1800);
      await director.click(page.getByLabel("Producto", { exact: true }));
      await director.click(page.getByRole("option", { name: PRODUCT }).first());
      await director.fill(
        page.getByLabel("Cantidad", { exact: true }),
        QUANTITY,
      );
      await director.click(page.getByRole("button", { name: "Agregar línea" }));
      const totals = page.locator("dl").filter({ hasText: "Subtotal" });
      await totals.getByText("Total").first().waitFor();
      await promo.pause(600);
      await director.highlight(totals, 2200);
    },
  );

  // 3. Sent.
  await scene(
    {
      name: "5-enviar",
      seconds: 13,
      kicker: REP,
      headline: "Enviar la congela y entrega el enlace del cliente.",
      narration:
        "Al enviarla, la versión queda congelada y el CRM entrega un enlace único para el cliente.",
      screen: {
        url: `/#/quotes/${state.quoteId}/show`,
        ready: (target) =>
          target.getByRole("button", { name: "Enviar", exact: true }),
      },
    },
    async () => {
      await promo.pause(1200);
      await director.click(
        page.getByRole("button", { name: "Enviar", exact: true }),
      );
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await promo.pause(800);
      await director.click(
        dialog.getByRole("button", { name: "Enviar", exact: true }),
      );
      const link = page.getByRole("textbox", {
        name: "Enlace para el cliente",
      });
      await link.first().waitFor();
      state.link = await link.first().inputValue();
      await director.highlight(link.first(), 2200);
      const done = page.getByRole("button", { name: "Listo" });
      if (await done.isVisible().catch(() => false)) await director.click(done);
    },
  );

  await scene(
    {
      name: "6-enviada",
      seconds: 6,
      kicker: REP,
      headline: "En Cotizaciones, ya figura como enviada.",
      narration: "En la lista de cotizaciones ya figura como enviada.",
      screen: { url: "/#/quotes", ready: text(cast.quote) },
    },
    async () => {
      await promo.pause(500);
      await director.highlight(
        page.getByRole("row").filter({ hasText: cast.quote }).first(),
        2400,
      );
    },
  );

  await scene(
    {
      name: "7-propuesta",
      seconds: 7,
      kicker: REP,
      headline: "Y en el tablero se movió sola a Propuesta enviada.",
      narration:
        "Y en el tablero, sin que nadie la arrastre, la oportunidad pasó a Propuesta enviada, con el importe de la cotización.",
      screen: {
        url: "/#/deals",
        ready: (target) =>
          target
            .locator('[data-rfd-droppable-id="proposal-sent"]')
            .getByText(cast.deal),
      },
    },
    async () => {
      const card = column("proposal-sent").getByText(cast.deal);
      await director.scrollTo(card);
      await director.highlight(card, 2600);
    },
  );

  // 4. The customer.
  await scene(
    {
      name: "8-cliente",
      seconds: 15,
      kicker: CUSTOMER,
      headline: "El cliente abre su enlace. Sin cuenta.",
      narration:
        "El cliente abre el enlace: primero la presentación de la empresa, después su cotización.",
      screen: {
        url: state.link ?? "",
        ready: (target) =>
          target.getByRole("button", { name: "Ver cotización directamente" }),
      },
    },
    async () => {
      await promo.pause(2200);
      // A look at the presentation, the way a customer scrolls it.
      await page.mouse.move(800, 500);
      for (let slide = 0; slide < 2; slide += 1) {
        await page.mouse.wheel(0, 900);
        await promo.pause(1700);
      }
      await director.click(
        page.getByRole("button", { name: "Ver cotización", exact: true }),
      );
      await page.getByRole("article").first().waitFor();
      await promo.pause(1500);
      // Down to the figures, not to the end of the page.
      await page.mouse.move(700, 500);
      await page.mouse.wheel(0, 420);
      await promo.pause(1800);
    },
  );

  await scene(
    {
      name: "9-pregunta",
      seconds: 9,
      kicker: CUSTOMER,
      headline: "Tiene una duda: la escribe ahí mismo.",
      headlineAt: "top",
      narration:
        "Tiene una duda y la escribe ahí mismo, en la cotización: le llega al comercial.",
    },
    async () => {
      const message = page.getByLabel("Su mensaje");
      await director.scrollTo(message);
      await director.type(message, QUESTION);
      await director.click(
        page.getByRole("button", { name: "Enviar mensaje" }),
      );
      await page.getByText(QUESTION).first().waitFor();
      await director.highlight(page.getByText(QUESTION).first(), 1600);
    },
  );

  // 5. The rep answers.
  await scene(
    {
      name: "10-respuesta",
      seconds: 13,
      kicker: REP,
      headline: "El comercial la ve en la cotización y responde.",
      narration:
        "El comercial ve la pregunta junto a la cotización y responde, compartiendo la respuesta con el cliente.",
      screen: {
        url: `/#/quotes/${state.quoteId}/show`,
        ready: text(QUESTION),
      },
    },
    async () => {
      const asked = page.getByText(QUESTION).first();
      await director.scrollTo(asked);
      await director.highlight(asked, 1400);
      const reply = page.getByPlaceholder("Escribe un comentario…");
      await director.type(reply, answerTo(cast.contact));
      await director.click(page.getByRole("switch").last());
      await director.click(
        page.getByRole("button", { name: "Enviar al cliente" }),
      );
      await page.getByText("Compartido con el cliente").first().waitFor();
      await promo.pause(1200);
    },
  );

  await scene(
    {
      name: "11-negociacion",
      seconds: 6,
      kicker: REP,
      headline: "Hay conversación: pasó a En negociación.",
      narration:
        "Con la conversación abierta, la oportunidad pasó sola a En negociación.",
      screen: {
        url: "/#/deals",
        ready: (target) =>
          target
            .locator('[data-rfd-droppable-id="in-negociation"]')
            .getByText(cast.deal),
      },
    },
    async () => {
      const card = column("in-negociation").getByText(cast.deal);
      await director.scrollTo(card);
      await director.highlight(card, 2600);
    },
  );

  // 6. The customer accepts.
  await scene(
    {
      name: "12-aceptar",
      seconds: 17,
      kicker: CUSTOMER,
      headline: "El cliente lee la respuesta y acepta.",
      narration:
        "El cliente lee la respuesta, y acepta la oferta con su nombre: queda registrado quién, cuándo y qué versión.",
      screen: {
        url: state.link ?? "",
        ready: (target) =>
          target.getByRole("button", { name: "Ver cotización directamente" }),
      },
    },
    async () => {
      await director.click(
        page.getByRole("button", { name: "Ver cotización directamente" }),
      );
      const answered = page.getByText(answerTo(cast.contact)).first();
      await answered.waitFor();
      await director.highlight(answered, 2000);
      const accept = page.getByRole("button", { name: "Aceptar", exact: true });
      await director.scrollTo(accept);
      await director.click(accept);
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await director.fill(dialog.getByLabel("Nombre completo"), cast.contact);
      await director.fill(
        dialog.getByLabel("Correo electrónico"),
        cast.contactEmail,
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
      await notice.first().waitFor();
      await director.scrollTo(notice.first());
      await director.highlight(notice.first(), 2200);
    },
  );

  // 7. What the acceptance changed, with nobody touching the CRM.
  await scene(
    {
      name: "13-aceptada",
      seconds: 7,
      kicker: REP,
      headline: "En Cotizaciones: aceptada.",
      narration:
        "De vuelta en el CRM, nadie tuvo que avisar: la cotización figura como aceptada.",
      screen: { url: "/#/quotes", ready: text(cast.quote) },
    },
    async () => {
      await promo.pause(500);
      await director.highlight(
        page.getByRole("row").filter({ hasText: cast.quote }).first(),
        2600,
      );
    },
  );

  await scene(
    {
      name: "14-evidencia",
      seconds: 7,
      kicker: REP,
      headline: "Con la evidencia: quién aceptó, cuándo y a qué cifra.",
      headlineAt: "top",
      narration:
        "Y guarda la evidencia de la respuesta: quién aceptó, cuándo, qué versión y a qué cifra.",
      screen: {
        url: `/#/quotes/${state.quoteId}/show`,
        ready: text("Respuesta del cliente"),
      },
    },
    async () => {
      await promo.pause(500);
      const signed = page.getByText("Firmada por").first();
      await director.scrollTo(signed);
      await director.highlight(signed, 2600);
    },
  );

  await scene(
    {
      name: "15-ganada",
      seconds: 8,
      kicker: REP,
      headline: "Y en el tablero: Ganada.",
      narration:
        "En el tablero, la oportunidad está en Ganada. La movió la aceptación del cliente, no una persona.",
      screen: {
        url: "/#/deals",
        ready: (target) =>
          target.locator('[data-rfd-droppable-id="won"]').getByText(cast.deal),
      },
    },
    async () => {
      const card = column("won").getByText(cast.deal);
      await director.scrollTo(card);
      await director.highlight(card, 3000);
    },
  );

  await scene(
    {
      name: "16-historia",
      seconds: 8,
      kicker: REP,
      headline: "Cada paso quedó en su historia.",
      narration:
        "Y cada paso quedó escrito en la historia de la oportunidad: el envío, la pregunta y la aceptación.",
      screen: {
        url: `/#/deals/${state.dealId}/show`,
        ready: text("Movida automáticamente: el cliente aceptó la cotización"),
      },
    },
    async () => {
      const moved = page
        .getByText("Movida automáticamente: el cliente aceptó la cotización")
        .first();
      await promo.pause(700);
      await director.scrollTo(moved);
      await promo.pause(2600);
    },
  );

  await promo.slate(SLATE.closing(logo ?? ""));
  await promo.finish();
  await promo.shot({
    name: "17-cierre",
    until: promo.now() + 4.5,
    narration: "Hermes CRM: de la oportunidad a la cotización aceptada.",
  });
});
