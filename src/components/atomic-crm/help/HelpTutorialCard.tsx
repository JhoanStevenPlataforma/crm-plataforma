import { Clock, Play } from "lucide-react";
import { useTranslate } from "ra-core";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";

import type { HelpTutorial } from "../types";
import { formatDuration, helpMediaUrl } from "./helpMedia";

/**
 * One tutorial on the index: its poster, what it teaches and how long it
 * takes. The whole card is the link; only the poster is fetched, and lazily.
 */
export const HelpTutorialCard = ({ tutorial }: { tutorial: HelpTutorial }) => {
  const translate = useTranslate();

  return (
    <Link
      to={`/help/${tutorial.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-card transition-shadow hover:shadow-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="relative aspect-video bg-muted">
        {tutorial.poster_path ? (
          <img
            src={helpMediaUrl(tutorial.poster_path)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : null}
        {/* In a corner, not the centre: the poster carries the title there. */}
        <span className="absolute bottom-2 left-2 flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-raised transition-transform group-hover:scale-110">
          <Play className="size-4 translate-x-px" aria-hidden />
        </span>
        {tutorial.duration_seconds != null ? (
          <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
            <Clock className="size-3" aria-hidden />
            {formatDuration(tutorial.duration_seconds)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="leading-snug font-semibold">{tutorial.title}</h3>
          {tutorial.is_published ? null : (
            <Badge variant="outline" className="shrink-0">
              {translate("crm.help.draft")}
            </Badge>
          )}
        </div>
        {tutorial.description ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {tutorial.description}
          </p>
        ) : null}
        <span className="mt-auto pt-2 text-sm font-medium text-brand">
          {translate("crm.help.watch")}
        </span>
      </div>
    </Link>
  );
};
