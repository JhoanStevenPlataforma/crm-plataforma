import { Search, Settings2 } from "lucide-react";
import { useCanAccess, useTranslate } from "ra-core";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { helpIconOf } from "./helpIcons";
import { HelpTutorialCard } from "./HelpTutorialCard";
import { filterHelpSections, useHelpCatalogue } from "./useHelpCatalogue";

/**
 * The manual (docs/proposals/help-center.md): short video tutorials, one task
 * each, grouped by category.
 *
 * The category and the search live in the URL, so a link to "the quotation
 * tutorials" can be sent to a new colleague. Nothing but posters is fetched
 * here; a recording is requested when its own page is opened and played.
 */
export const HelpCenterPage = () => {
  const translate = useTranslate();
  const { sections, isPending, error } = useHelpCatalogue();
  const { canAccess: canManage } = useCanAccess({
    resource: "help_tutorials",
    action: "edit",
  });
  const [params, setParams] = useSearchParams();
  const categorySlug = params.get("category");
  const query = params.get("q") ?? "";

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };

  const visible = filterHelpSections(sections, categorySlug, query);

  return (
    <div className="flex flex-col">
      <PageHeader
        title={translate("crm.help.title")}
        description={translate("crm.help.description")}
        actions={
          canManage ? (
            <Button asChild variant="outline">
              <Link to="/help_tutorials">
                <Settings2 className="size-4" />
                {translate("crm.help.manage")}
              </Link>
            </Button>
          ) : null
        }
      />

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {translate("crm.help.errors.load_failed")}
        </p>
      ) : sections.length === 0 ? (
        <div className="flex max-w-xl flex-col items-start gap-3 rounded-xl border border-dashed p-8">
          <p className="text-sm text-muted-foreground">
            {translate(canManage ? "crm.help.empty_admin" : "crm.help.empty")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <div className="relative max-w-md">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setParam("q", event.target.value)}
                placeholder={translate("crm.help.search")}
                aria-label={translate("crm.help.search")}
                className="pl-9"
              />
            </div>
            <div
              role="group"
              aria-label={translate("crm.help.categories")}
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
            >
              <CategoryChip
                isActive={!categorySlug}
                onClick={() => setParam("category", null)}
              >
                {translate("crm.help.all_categories")}
              </CategoryChip>
              {sections.map(({ category }) => {
                const Icon = helpIconOf(category.icon);
                return (
                  <CategoryChip
                    key={category.id}
                    isActive={categorySlug === category.slug}
                    onClick={() => setParam("category", category.slug)}
                  >
                    <Icon className="size-4" aria-hidden />
                    {category.title}
                  </CategoryChip>
                );
              })}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {translate("crm.help.no_results")}
            </p>
          ) : (
            visible.map(({ category, tutorials }) => {
              const Icon = helpIconOf(category.icon);
              return (
                <section
                  key={category.id}
                  aria-labelledby={`help-category-${category.id}`}
                  className="flex flex-col gap-4"
                >
                  <header className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand/20 bg-brand-tint text-brand shadow-card">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <h2
                        id={`help-category-${category.id}`}
                        className="text-lg leading-tight font-semibold"
                      >
                        {category.title}
                      </h2>
                      {category.description ? (
                        <p className="max-w-3xl text-sm text-muted-foreground">
                          {category.description}
                        </p>
                      ) : null}
                    </div>
                  </header>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {tutorials.map((tutorial) => (
                      <HelpTutorialCard key={tutorial.id} tutorial={tutorial} />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

HelpCenterPage.path = "/help";

const CategoryChip = ({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={isActive}
    onClick={onClick}
    className={cn(
      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      isActive
        ? "border-brand bg-brand-tint text-brand"
        : "bg-card text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);
