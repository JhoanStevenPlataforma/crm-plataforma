import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { Page } from "@playwright/test";

import { OUTPUT_DIR, test } from "./promoStudio";

/**
 * Not part of the film: a still and an accessibility snapshot of every
 * screen it visits, to write its locators against what is really there.
 *
 *   npm run promo:record -- -g scout
 *   PROMO_SCOUT=portal,email npm run promo:record -- -g scout
 */
const SCREENS: Record<string, string> = {
  dashboard: "/#/",
  leads: "/#/leads",
  lead: "/#/leads/3",
  deals: "/#/deals",
  deal: "/#/deals/8/show",
  quoteEdit: "/#/quotes/13",
  quoteFx: "/#/quotes/36/show",
  quoteAccepted: "/#/quotes/12/show",
  dealCreate: "/#/deals/create",
  quoteCreate: "/#/quotes/create",
  quotesList: "/#/quotes",
  tasks: "/#/tasks?scope=all",
  tasksKanban: "/#/tasks?view=kanban&scope=all",
  tasksCalendar: "/#/tasks?view=calendar&scope=all",
  reports: "/#/reports",
  reportTrend: "/#/reports/3",
  reportOwner: "/#/reports/2",
  reportStacked: "/#/reports/6",
  reportNew: "/#/reports/new",
  analytics: "/#/analytics",
  teams: "/#/teams-dashboard",
  sales: "/#/sales",
  help: "/#/help",
};

const uncover = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __promo: { cover: (c: null) => void } }
    ).__promo.cover(null),
  );

test("scout", async ({ studio }) => {
  const { page } = studio;
  const only = process.env.PROMO_SCOUT?.split(",");
  const wanted = (name: string) => !only || only.includes(name);
  const still = async (name: string) => {
    await page.waitForTimeout(1500);
    const base = path.join(OUTPUT_DIR, "scout", name);
    await page.screenshot({ path: `${base}.png` });
    await writeFile(`${base}.yml`, await page.locator("body").ariaSnapshot());
  };

  for (const [name, url] of Object.entries(SCREENS)) {
    if (!wanted(name)) continue;
    await page.goto(url);
    await uncover(page);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await still(name);
  }

  if (wanted("taskCreate")) {
    await page.goto(SCREENS.tasks);
    await uncover(page);
    await page.getByRole("button", { name: "Añadir tarea" }).click();
    await still("taskCreate");
    await page.keyboard.press("Escape");
  }

  if (wanted("reportBuilder")) {
    await page.goto(SCREENS.reports);
    await uncover(page);
    await page.getByText("Valor por etapa y comercial").click();
    await still("reportFromLibrary");
    await page.getByRole("button", { name: "Configurar" }).click();
    await still("reportBuilder");
  }

  if (wanted("email") || wanted("portal")) {
    await page.goto(SCREENS.quoteFx);
    await uncover(page);
    const link = await page
      .getByRole("textbox", { name: "Enlace para el cliente" })
      .inputValue();
    if (wanted("email")) {
      await page.getByRole("button", { name: "Enviar por correo" }).click();
      await page.getByRole("dialog").waitFor();
      await still("email");
      await page.keyboard.press("Escape");
    }
    if (wanted("portal")) {
      await page.goto(link);
      await uncover(page);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await still("portal-1-hero");
      const skip = page.getByRole("button", {
        name: "Ver cotización directamente",
      });
      if (await skip.isVisible()) await skip.click();
      await still("portal-2-document");
      await page.keyboard.press("End");
      await still("portal-3-end");
    }
  }
});
