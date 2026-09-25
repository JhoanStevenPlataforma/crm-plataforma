import { DEMO_PORTAL_SLIDES } from "../../providers/fakerest/dataGenerator/portalTemplates";
import {
  fillSlidePlaceholders,
  portalMediaUrl,
  portalSlideSchema,
  slideElementSchema,
} from "./portalSlides";

const values = {
  company: "Acme Andina",
  contact: "Lucía",
  quote: "Evento 2027",
  brand: "Plataforma",
};

const textBox = (text: string) => ({
  id: "t",
  kind: "text" as const,
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  text,
  size: "md" as const,
  align: "left" as const,
  color: "light" as const,
});

describe("fillSlidePlaceholders", () => {
  it("writes the quotation's own values into every text box", () => {
    const [slide] = fillSlidePlaceholders(
      [
        {
          elements: [
            textBox("Una propuesta para {company}, {contact}: {quote}"),
          ],
        },
      ],
      values,
    );

    expect(slide.elements[0]).toMatchObject({
      text: "Una propuesta para Acme Andina, Lucía: Evento 2027",
    });
  });

  it("leaves no stray comma or double space behind an empty value", () => {
    const [slide] = fillSlidePlaceholders(
      [{ elements: [textBox("Hola {contact}, somos {brand}")] }],
      { ...values, contact: "" },
    );

    expect(slide.elements[0]).toMatchObject({ text: "Hola, somos Plataforma" });
  });

  it("prints a company called <script> as those characters, and leaves pictures alone", () => {
    const picture = DEMO_PORTAL_SLIDES[0].elements[0];
    const [slide] = fillSlidePlaceholders(
      [{ elements: [picture, textBox("{company}")] }],
      { ...values, company: "<script>" },
    );

    expect(slide.elements[0]).toBe(picture);
    expect(slide.elements[1]).toMatchObject({ text: "<script>" });
  });
});

describe("the default template", () => {
  it("passes the schema the portal validates payloads with", () => {
    for (const slide of DEMO_PORTAL_SLIDES) {
      expect(portalSlideSchema.safeParse(slide).success).toBe(true);
    }
  });

  it("serves its pictures from the app bundle, not from storage", () => {
    expect(portalMediaUrl("builtin/cover.webp")).not.toContain("/storage/");
    expect(
      portalMediaUrl("slides/11111111-1111-4111-8111-111111111111.webp"),
    ).toContain("/storage/v1/object/public/portal-media/");
  });

  it("accepts only the bundled names under builtin/", () => {
    const image = DEMO_PORTAL_SLIDES[0].elements[0];

    expect(
      slideElementSchema.safeParse({ ...image, path: "builtin/other.webp" })
        .success,
    ).toBe(false);
  });
});
