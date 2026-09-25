import { ExternalLink, Lock } from "lucide-react";
import { useTranslate } from "ra-core";

import { Button } from "@/components/ui/button";

import { DEFAULT_QUOTE_PRESENTATION } from "../quotes/portal/quotePortalPresentation";
import { StandardPresentationPreview } from "./StandardPresentationPreview";

/**
 * What the editor shows for the default template: the original designed
 * presentation, which is not made of free boxes and is not edited here. Its
 * cover and slides are listed as they appear, and the real thing opens full
 * screen in another tab.
 */
export const StandardTemplateView = () => {
  const translate = useTranslate();
  const { cover, slides } = DEFAULT_QUOTE_PRESENTATION;
  const cards = [
    {
      key: "cover",
      image: cover.image?.url ?? null,
      eyebrow: cover.eyebrow,
      title: cover.title,
    },
    ...slides.map((slide) => ({
      key: slide.key,
      image: slide.media.kind === "image" ? slide.media.url : null,
      eyebrow: slide.eyebrow,
      title: slide.title,
    })),
  ];

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-card">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          {translate("crm.portal_slides.templates.locked_hint")}
        </p>
        <Button asChild size="sm" variant="outline">
          <a
            href={`#${StandardPresentationPreview.path}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="size-4" />
            {translate("crm.portal_slides.templates.preview")}
          </a>
        </Button>
      </div>
      <ol className="grid gap-4 sm:grid-cols-2">
        {cards.map((card, index) => (
          <li
            key={card.key}
            className="dark overflow-hidden rounded-xl bg-background text-foreground shadow-raised ring-1 ring-border"
          >
            <div className="relative aspect-video bg-surface">
              {card.image ? (
                <img
                  src={card.image}
                  alt=""
                  className="size-full object-cover opacity-80"
                />
              ) : null}
              <span className="absolute top-2 left-2 rounded-md bg-background/80 px-2 py-0.5 text-xs tabular-nums">
                {index === 0
                  ? translate("crm.portal_slides.templates.cover")
                  : String(index).padStart(2, "0")}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-3">
              <span className="text-[10px] font-bold tracking-[0.18em] text-brand uppercase">
                {card.eyebrow}
              </span>
              <span className="text-sm font-semibold">{card.title}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};
