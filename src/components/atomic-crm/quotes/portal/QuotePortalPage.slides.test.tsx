import { render } from "vitest-browser-react";

import {
  Open,
  StandardPresentation,
  WithSlides,
} from "./QuotePortalPage.stories";

/**
 * The company's slides before the quotation (quote-portal-presentation.md §7),
 * rendered through the real `/quote#<token>` route with the fake portal.
 */
describe("QuotePortalPage slides", () => {
  it("shows every slide, in order and where it was placed, before the quotation", async () => {
    const screen = await render(<WithSlides />);

    const first = screen.getByRole("region", { name: "Slide 1 of 2" });
    const second = screen.getByRole("region", { name: "Slide 2 of 2" });
    await expect.element(first).toBeInTheDocument();
    await expect
      .element(first.getByText("People behind every event"))
      .toBeInTheDocument();
    await expect
      .element(second.getByText("Twenty years on stage"))
      .toBeInTheDocument();

    // The picture is served from the public bucket under its checked path,
    // and sits where the admin put it (left half of the stage).
    const picture = first.getByRole("img", { name: "Our team" });
    await expect
      .element(picture)
      .toHaveAttribute(
        "src",
        expect.stringMatching(
          /\/storage\/v1\/object\/public\/portal-media\/slides\/11111111-1111-4111-8111-111111111111\.webp$/,
        ),
      );
    const box = picture.element().parentElement;
    expect(box?.style.left).toBe("0%");
    expect(box?.style.width).toBe("55%");

    // The quotation is still there, after the slides, numbered after them.
    const sections = [...document.querySelectorAll("main > section[id]")].map(
      (section) => section.id,
    );
    expect(sections).toEqual([
      "quote-portal-slide-1",
      "quote-portal-slide-2",
      "quote-portal-quotation",
    ]);
    await expect.element(screen.getByText(/^03 · /)).toBeInTheDocument();
    await expect.element(screen.getByRole("article")).toBeVisible();
  });

  it("shows the original designed presentation when the default template was active", async () => {
    const screen = await render(<StandardPresentation />);

    // The cover, written for this customer, then the three designed slides.
    await expect
      .element(
        screen.getByRole("heading", {
          level: 1,
          name: /Una propuesta pensada para Acme Andina/,
        }),
      )
      .toBeInTheDocument();
    await expect
      .element(
        screen.getByText("Personas detrás de experiencias que conectan."),
      )
      .toBeInTheDocument();
    await expect.element(screen.getByText("Innovación")).toBeInTheDocument();
    const sections = [...document.querySelectorAll("main > section[id]")].map(
      (section) => section.id,
    );
    expect(sections).toEqual([
      "quote-portal-cover",
      "quote-portal-slide-empresa",
      "quote-portal-slide-proposito",
      "quote-portal-slide-certificaciones",
      "quote-portal-quotation",
    ]);
    await expect.element(screen.getByText(/^04 · /)).toBeInTheDocument();
  });

  it("opens on the plain cover when nothing was active", async () => {
    const screen = await render(<Open />);

    await expect
      .element(
        screen.getByRole("heading", {
          level: 1,
          name: "A proposal prepared for Acme Andina",
        }),
      )
      .toBeInTheDocument();
    expect(document.querySelector("#quote-portal-slide-1")).toBeNull();
    await expect.element(screen.getByRole("article")).toBeVisible();
  });
});
