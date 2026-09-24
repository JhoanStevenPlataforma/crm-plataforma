import {
  personalizePresentation,
  type QuotePortalPresentation,
} from "./quotePortalPresentation";

const deck: QuotePortalPresentation = {
  cover: {
    navLabel: "Welcome",
    eyebrow: "{brand}",
    title: "A proposal for {company}",
    titleAccent: "{quote}",
    body: "Dear {contact}, thank you.",
    image: null,
  },
  slides: [
    {
      key: "team",
      navLabel: "Team",
      eyebrow: "Team",
      title: "Who works for {company}",
      paragraphs: ["First line for {company}\nSecond line"],
      highlights: [{ title: "{brand}", text: "Unknown {token} stays" }],
      media: { kind: "image", url: "/team.webp", alt: "Team" },
      mediaSide: "left",
    },
  ],
};

const values = {
  company: "Helios Energia",
  contact: "Ana Comercial",
  quote: "Plan de eventos 3 días",
  brand: "Plataforma Software",
};

describe("personalizePresentation", () => {
  it("names the customer, the addressee and the quotation wherever the deck asks for them", () => {
    const result = personalizePresentation(deck, values);

    expect(result.cover.title).toBe("A proposal for Helios Energia");
    expect(result.cover.titleAccent).toBe("Plan de eventos 3 días");
    expect(result.cover.body).toBe("Dear Ana Comercial, thank you.");
    expect(result.cover.eyebrow).toBe("Plataforma Software");
    expect(result.slides[0].title).toBe("Who works for Helios Energia");
    expect(result.slides[0].highlights[0]).toEqual({
      title: "Plataforma Software",
      text: "Unknown {token} stays",
    });
  });

  it("keeps the author's line breaks inside a paragraph", () => {
    const result = personalizePresentation(deck, values);

    expect(result.slides[0].paragraphs[0]).toBe(
      "First line for Helios Energia\nSecond line",
    );
  });

  it("drops the accent line and tidies the sentence when a value is empty", () => {
    const result = personalizePresentation(deck, {
      ...values,
      contact: "",
      quote: "",
    });

    expect(result.cover.titleAccent).toBeNull();
    expect(result.cover.body).toBe("Dear, thank you.");
  });

  it("inserts a hostile company name as plain characters and leaves the deck untouched", () => {
    const result = personalizePresentation(deck, {
      ...values,
      company: "<img src=x onerror=alert(1)>",
    });

    expect(result.cover.title).toBe(
      "A proposal for <img src=x onerror=alert(1)>",
    );
    expect(deck.cover.title).toBe("A proposal for {company}");
  });
});
