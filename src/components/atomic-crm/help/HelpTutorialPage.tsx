import { ArrowLeft, ArrowRight, Clock, Pencil } from "lucide-react";
import { useCanAccess, useLocaleState, useTranslate } from "ra-core";
import { Link, useParams } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { formatDuration } from "./helpMedia";
import { HelpVideoPlayer } from "./HelpVideoPlayer";
import { useHelpCatalogue } from "./useHelpCatalogue";

/**
 * One tutorial: the recording, what it covers step by step, and the way to
 * the next one in its category. Addressed by slug, so the link survives the
 * recording being replaced.
 */
export const HelpTutorialPage = () => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const { slug } = useParams();
  const { sections, isPending } = useHelpCatalogue();
  const { canAccess: canManage } = useCanAccess({
    resource: "help_tutorials",
    action: "edit",
  });

  if (isPending) {
    return <Skeleton className="aspect-video w-full max-w-5xl rounded-xl" />;
  }

  const section = sections.find(({ tutorials }) =>
    tutorials.some((tutorial) => tutorial.slug === slug),
  );
  const index = section?.tutorials.findIndex((t) => t.slug === slug) ?? -1;
  const tutorial = section?.tutorials[index];

  if (!section || !tutorial) {
    return (
      <div className="flex max-w-xl flex-col items-start gap-3 rounded-xl border border-dashed p-8">
        <p className="text-sm text-muted-foreground">
          {translate("crm.help.not_found")}
        </p>
        <Button asChild variant="outline">
          <Link to="/help">
            <ArrowLeft className="size-4" />
            {translate("crm.help.back")}
          </Link>
        </Button>
      </div>
    );
  }

  const previous = section.tutorials[index - 1];
  const next = section.tutorials[index + 1];

  return (
    <article className="flex w-full max-w-5xl flex-col gap-5">
      <Link
        to={`/help?category=${section.category.slug}`}
        className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {section.category.title}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-[1.75rem] leading-tight font-semibold">
            {tutorial.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {tutorial.duration_seconds != null ? (
              <span className="flex items-center gap-1 tabular-nums">
                <Clock className="size-3.5" aria-hidden />
                {formatDuration(tutorial.duration_seconds)}
              </span>
            ) : null}
            {tutorial.updated_at ? (
              <span>
                {translate("crm.help.updated_on", {
                  date: new Date(tutorial.updated_at).toLocaleDateString(
                    locale,
                    { dateStyle: "medium" },
                  ),
                })}
              </span>
            ) : null}
            {tutorial.is_published ? null : (
              <Badge variant="outline">{translate("crm.help.draft")}</Badge>
            )}
          </div>
        </div>
        {canManage ? (
          <Button asChild variant="outline" size="sm">
            <Link to={`/help_tutorials/${tutorial.id}`}>
              <Pencil className="size-4" />
              {translate("ra.action.edit")}
            </Link>
          </Button>
        ) : null}
      </header>

      <HelpVideoPlayer tutorial={tutorial} />

      {tutorial.description ? (
        <p className="text-muted-foreground">{tutorial.description}</p>
      ) : null}

      {tutorial.steps.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="font-semibold">{translate("crm.help.steps")}</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm marker:font-semibold marker:text-brand">
            {tutorial.steps.map((step, position) => (
              <li key={position}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {previous || next ? (
        <nav
          aria-label={translate("crm.help.more_in_category")}
          className="grid gap-3 sm:grid-cols-2"
        >
          {previous ? (
            <Link
              to={`/help/${previous.slug}`}
              className="flex flex-col gap-0.5 rounded-xl border bg-card p-4 shadow-card hover:shadow-raised"
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="size-3.5" aria-hidden />
                {translate("crm.navigation.previous")}
              </span>
              <span className="font-medium">{previous.title}</span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next ? (
            <Link
              to={`/help/${next.slug}`}
              className="flex flex-col items-end gap-0.5 rounded-xl border bg-card p-4 text-right shadow-card hover:shadow-raised"
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {translate("crm.navigation.next")}
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
              <span className="font-medium">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </article>
  );
};

HelpTutorialPage.path = "/help/:slug";
