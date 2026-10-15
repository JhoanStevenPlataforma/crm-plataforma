import { useGetList } from "ra-core";
import { useMemo } from "react";

import type { HelpCategory, HelpTutorial } from "../types";

export type HelpSection = { category: HelpCategory; tutorials: HelpTutorial[] };

/**
 * The manual, as the reader sees it: categories in order, each with its
 * tutorials in order, and no category that has nothing to show. A draft only
 * reaches an admin -- RLS withholds it from everybody else -- so nothing here
 * filters on `is_published`.
 */
export const groupHelpSections = (
  categories: HelpCategory[],
  tutorials: HelpTutorial[],
): HelpSection[] =>
  categories
    .map((category) => ({
      category,
      tutorials: tutorials.filter(
        (tutorial) => tutorial.category_id === category.id,
      ),
    }))
    .filter((section) => section.tutorials.length > 0);

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** The sections a category chip and a search leave: accents do not matter. */
export const filterHelpSections = (
  sections: HelpSection[],
  categorySlug: string | null,
  query: string,
): HelpSection[] => {
  const needle = normalize(query.trim());
  return sections
    .filter(
      (section) => !categorySlug || section.category.slug === categorySlug,
    )
    .map((section) => ({
      ...section,
      tutorials: needle
        ? section.tutorials.filter((tutorial) =>
            normalize(
              `${tutorial.title} ${tutorial.description ?? ""}`,
            ).includes(needle),
          )
        : section.tutorials,
    }))
    .filter((section) => section.tutorials.length > 0);
};

/**
 * Both lists are read whole: a manual is tens of rows, and one cached read
 * serves the index, every tutorial page and its previous / next links.
 */
export const useHelpCatalogue = () => {
  const categories = useGetList<HelpCategory>("help_categories", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "rank", order: "ASC" },
  });
  const tutorials = useGetList<HelpTutorial>("help_tutorials", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "rank", order: "ASC" },
  });
  const sections = useMemo(
    () => groupHelpSections(categories.data ?? [], tutorials.data ?? []),
    [categories.data, tutorials.data],
  );
  return {
    sections,
    isPending: categories.isPending || tutorials.isPending,
    error: categories.error ?? tutorials.error,
  };
};
