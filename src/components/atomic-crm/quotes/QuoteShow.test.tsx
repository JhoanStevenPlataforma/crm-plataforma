import type { MockInstance } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import {
  Issued,
  PrintFirstVersion,
  PrintForeignVersion,
  Revised,
} from "./QuoteShow.stories";

/**
 * Rendered through the REAL routes (`/quotes/1/show`, `/quotes/1/print`) over
 * the demo provider, so these also prove the page and the print route are
 * registered: an unregistered route renders nothing, and every assertion below
 * would fail on it.
 */
describe("QuoteShow", () => {
  beforeAll(() => {
    // The mobile admin registers no quote routes at all.
    page.viewport(1600, 900);
  });

  it("prints the customer as they were when the version was issued, not as the CRM knows them today", async () => {
    const screen = await render(<Issued />);
    const sheet = screen.getByRole("article", {
      name: "Quotation Q-2026-00001",
    });

    await expect.element(sheet.getByText("Calle 1 # 2-3")).toBeVisible();
    await expect.element(sheet.getByText("Tax ID 900.123.456-7")).toBeVisible();
    await expect
      .element(sheet.getByText("Carrera 99 # 10-20"))
      .not.toBeInTheDocument();
    await expect.element(sheet.getByText("$642,600.00").first()).toBeVisible();
    // An issued, current document carries no warning on the paper.
    await expect.element(sheet.getByRole("note")).not.toBeInTheDocument();
  });

  it("opens on the draft being worked on, and still shows the version the customer was sent", async () => {
    const screen = await render(<Revised />);
    const sheet = screen.getByRole("article");

    // The current version is the draft, and the paper itself says so.
    await expect
      .element(sheet.getByRole("note"))
      .toHaveTextContent(/Draft — not an offer/);
    await expect.element(sheet.getByText("Annual license")).toBeVisible();
    // A draft has no snapshot yet, so it previews today's address.
    await expect.element(sheet.getByText("Carrera 99 # 10-20")).toBeVisible();

    await screen.getByRole("button", { name: /^Version 1\b/ }).click();

    await expect
      .element(sheet.getByText("Implementation project"))
      .toBeVisible();
    await expect
      .element(sheet.getByText("Annual license"))
      .not.toBeInTheDocument();
    await expect
      .element(sheet.getByRole("note"))
      .toHaveTextContent(/Superseded/);
    await expect.element(sheet.getByText("Calle 1 # 2-3")).toBeVisible();
  });

  it("sends Print to the print route for the version on screen, not for the newest one", async () => {
    const screen = await render(<Revised />);

    await screen.getByRole("button", { name: /^Version 1\b/ }).click();

    await expect
      .element(screen.getByRole("link", { name: "Print / PDF" }))
      .toHaveAttribute("href", "/quotes/1/print?version=10");
  });
});

describe("QuotePrintPage", () => {
  let print: MockInstance<() => void>;
  let atPrint: { text: string; images: boolean[] }[];

  beforeAll(() => {
    page.viewport(1600, 900);
  });

  beforeEach(() => {
    atPrint = [];
    // What the page looked like at the instant the dialog would have opened.
    // Asserting only that `print` was called would pass for a dialog opened on
    // a skeleton, which is the failure this page exists to prevent.
    print = vi.spyOn(window, "print").mockImplementation(() => {
      const sheet = document.querySelector("article");
      atPrint.push({
        text: sheet?.textContent ?? "",
        images: Array.from(sheet?.querySelectorAll("img") ?? []).map(
          (image) => image.complete,
        ),
      });
    });
  });

  afterEach(() => {
    print.mockRestore();
  });

  it("prints the version named in the URL, once, on the finished document", async () => {
    const screen = await render(<PrintFirstVersion />);

    // Three reads in sequence (the quote, its versions, the chosen version's
    // lines) over the demo provider's simulated latency, then the logo: about
    // 1.3 s measured, past the one-second default of a poll.
    await expect.poll(() => atPrint.length, { timeout: 5000 }).toBe(1);
    expect(atPrint[0].text).toContain("Implementation project");
    expect(atPrint[0].text).not.toContain("Annual license");
    // The letterhead had finished loading: an image still loading prints as an
    // empty box.
    expect(atPrint[0].images).toEqual([true]);
    await expect
      .element(screen.getByRole("button", { name: "Print again" }))
      .toBeEnabled();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("refuses a version that is not this quote's instead of printing the newest one", async () => {
    const screen = await render(<PrintForeignVersion />);

    await expect
      .element(
        screen.getByText(
          "That version does not belong to this quote, so there is nothing to print.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("article")).not.toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
  });
});
