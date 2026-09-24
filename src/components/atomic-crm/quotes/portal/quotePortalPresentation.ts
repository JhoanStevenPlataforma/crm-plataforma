import certificationsImage from "./assets/certifications.webp";
import companyImage from "./assets/company.webp";
import coverImage from "./assets/cover.webp";
import purposeImage from "./assets/purpose.webp";

/**
 * The presentation a customer reads BEFORE the quotation: a cover and a run of
 * slides, each a picture (or a video) beside a heading, some copy and a grid of
 * highlights.
 *
 * TODAY IT IS STATIC: `DEFAULT_QUOTE_PRESENTATION` below, the installation's own
 * deck, shipped with the build. The shape is the one the per-company editor
 * will store (docs/proposals/quote-portal-presentation.md), so moving it to the
 * server changes where the object comes from, not how the portal renders it.
 *
 * The copy is company content, not interface text: it is written in the
 * language the company sells in and is not run through the i18n catalogs.
 * It may name the quotation it is shown with — `{company}`, `{contact}`,
 * `{quote}`, `{brand}` — filled in by `personalizePresentation()`, so one deck
 * reads as written for each customer.
 * Everything is rendered as React text — never HTML — because on the portal it
 * reaches a page anybody holding a link can open.
 */

export type QuotePortalMedia =
  | { kind: "image"; url: string; alt: string }
  | { kind: "video"; url: string; poster?: string; alt: string };

export type QuotePortalHighlight = { title: string; text: string };

export type QuotePortalSlide = {
  /** Stable, unique within the deck: the section's DOM id derives from it. */
  key: string;
  /** The dot navigation's tooltip. */
  navLabel: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  highlights: QuotePortalHighlight[];
  media: QuotePortalMedia;
  /** Which side the picture sits on; slides alternate in the default deck. */
  mediaSide: "left" | "right";
};

export type QuotePortalCover = {
  navLabel: string;
  eyebrow: string;
  title: string;
  /** The second line of the heading, set in the brand colour. */
  titleAccent: string | null;
  body: string;
  image: { url: string; alt: string } | null;
};

export type QuotePortalPresentation = {
  cover: QuotePortalCover;
  slides: QuotePortalSlide[];
};

export const DEFAULT_QUOTE_PRESENTATION: QuotePortalPresentation = {
  cover: {
    navLabel: "Bienvenida",
    eyebrow: "Plataforma Software · Event Production Company",
    title: "Una propuesta pensada para {company}",
    titleAccent: "{quote}",
    body: "Gracias por confiar en Plataforma Software. Hemos preparado esta propuesta para {company} con el fin de presentarte nuestra experiencia, nuestra forma de trabajar y, finalmente, el detalle de la solución y la inversión.",
    image: {
      url: coverImage,
      alt: "Plataforma Software - Event Production Company",
    },
  },
  slides: [
    {
      key: "empresa",
      navLabel: "Quiénes somos",
      eyebrow: "Nuestra empresa",
      title: "Personas detrás de experiencias que conectan.",
      paragraphs: [
        "Conoce al equipo y la experiencia que respaldan esta propuesta para {company}. Esta sección funciona como introducción corporativa y busca generar contexto antes de entrar en la solución.",
      ],
      highlights: [
        {
          title: "Experiencia",
          text: "Equipo especializado en producción y tecnología.",
        },
        {
          title: "Innovación",
          text: "Soluciones propias aplicadas a eventos y comunicación.",
        },
        {
          title: "Equipo",
          text: "Profesionales trabajando de forma coordinada.",
        },
        {
          title: "Resultados",
          text: "Procesos orientados a crear valor para el cliente.",
        },
      ],
      media: {
        kind: "image",
        url: companyImage,
        alt: "Plataforma Software en evento",
      },
      mediaSide: "left",
    },
    {
      key: "proposito",
      navLabel: "Propósito",
      eyebrow: "Propósito",
      title: "Tecnología aplicada a experiencias reales.",
      paragraphs: [
        "Somos una compañía dedicada al desarrollo de soluciones tecnológicas propias aplicadas a la producción de eventos y a facilitar procesos de comunicación empresarial.",
        "Nuestro objetivo es generar elementos diferenciadores en los productos y servicios donde son implementados.",
      ],
      highlights: [
        {
          title: "Soluciones propias",
          text: "Desarrollo tecnológico orientado a necesidades concretas.",
        },
        {
          title: "Nuevos modelos",
          text: "Capacidad para construir nuevas formas de negocio.",
        },
      ],
      media: {
        kind: "image",
        url: purposeImage,
        alt: "Propósito de Plataforma Software",
      },
      mediaSide: "right",
    },
    {
      key: "certificaciones",
      navLabel: "Certificaciones",
      eyebrow: "Confianza",
      title: "El respaldo también hace parte de la propuesta.",
      paragraphs: [
        "Presenta aquí certificaciones, reconocimientos, experiencia o elementos que ayuden al cliente a entender por qué puede confiar en el proveedor.",
      ],
      highlights: [
        {
          title: "ISO 9001:2015",
          text: "Procesos orientados a la calidad y mejora continua.",
        },
        {
          title: "ISO 27001",
          text: "Seguridad y privacidad de la información.",
        },
        {
          title: "Capacitación",
          text: "Equipo preparado en conocimiento especializado.",
        },
        { title: "Servicio", text: "Experiencia centrada en el cliente." },
      ],
      media: {
        kind: "image",
        url: certificationsImage,
        alt: "Certificaciones y experiencia",
      },
      mediaSide: "left",
    },
  ],
};

/** "01", "02"…: the number a slide's eyebrow carries, the quotation last. */
export const slideNumber = (index: number) =>
  String(index + 1).padStart(2, "0");

export const slideSectionId = (slide: Pick<QuotePortalSlide, "key">) =>
  `quote-portal-slide-${slide.key}`;

/** The values a deck's `{placeholders}` are filled with. */
export type QuotePortalPresentationValues = {
  company: string;
  contact: string;
  quote: string;
  brand: string;
};

const PLACEHOLDER = /\{(company|contact|quote|brand)\}/g;

const fill = (text: string, values: QuotePortalPresentationValues) =>
  text
    .replace(PLACEHOLDER, (_, key: keyof QuotePortalPresentationValues) =>
      values[key].trim(),
    )
    // A placeholder with nothing behind it must not leave "for , the…" or a
    // double space in the sentence around it. Spaces and tabs only: a line
    // break in a paragraph is formatting the author meant.
    .replace(/[ \t]+([,.;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

/** Empty after filling (e.g. `{quote}` on an untitled quotation): no line. */
const fillOptional = (
  text: string | null,
  values: QuotePortalPresentationValues,
) => (text == null ? null : fill(text, values) || null);

/**
 * The deck as THIS customer reads it: every `{placeholder}` replaced by the
 * quotation's own values. Returns a new object; the deck itself is untouched.
 * The values are plain text and so is the result — it is rendered as React
 * text, so a company called `<script>` prints as those characters.
 */
export const personalizePresentation = (
  presentation: QuotePortalPresentation,
  values: QuotePortalPresentationValues,
): QuotePortalPresentation => ({
  cover: {
    ...presentation.cover,
    navLabel: fill(presentation.cover.navLabel, values),
    eyebrow: fill(presentation.cover.eyebrow, values),
    title: fill(presentation.cover.title, values),
    titleAccent: fillOptional(presentation.cover.titleAccent, values),
    body: fill(presentation.cover.body, values),
  },
  slides: presentation.slides.map((slide) => ({
    ...slide,
    navLabel: fill(slide.navLabel, values),
    eyebrow: fill(slide.eyebrow, values),
    title: fill(slide.title, values),
    paragraphs: slide.paragraphs.map((paragraph) => fill(paragraph, values)),
    highlights: slide.highlights.map((highlight) => ({
      title: fill(highlight.title, values),
      text: fill(highlight.text, values),
    })),
  })),
});
