import { useCallback } from "react";
import { useDataProvider, type DataProvider } from "ra-core";

import type { Tag } from "../types";

// Tags are a shared vocabulary of a few dozen words, not CRM-scale data.
const ALL_TAGS = { page: 1, perPage: 1000 };

/** The key `tags_name_unique` compares on: case and surrounding spaces ignored. */
export const tagKey = (name: string) => name.trim().toLowerCase();

const findTag = async (dataProvider: DataProvider, name: string) => {
  const { data } = await dataProvider.getList<Tag>("tags", {
    pagination: ALL_TAGS,
    sort: { field: "id", order: "ASC" },
    filter: {},
  });
  return data.find((tag) => tagKey(tag.name) === tagKey(name));
};

/**
 * Creates a tag, or returns the one that already has that name.
 *
 * Typing "VIP" when "vip" exists used to create a second tag, and a contact
 * could end up wearing both ("vip vip"). The database now refuses the
 * duplicate (`tags_name_unique`); this returns the existing tag instead, so
 * the user simply gets the tag they meant. A create that loses a race with a
 * colleague typing the same word falls back to the winner.
 */
export function useCreateTag() {
  const dataProvider = useDataProvider();

  return useCallback(
    async (data: Pick<Tag, "name" | "color">) => {
      const name = data.name.trim();
      const existing = await findTag(dataProvider, name);
      if (existing) return existing;
      try {
        const response = await dataProvider.create<Tag>("tags", {
          data: { ...data, name },
        });
        return response.data;
      } catch (error) {
        const winner = await findTag(dataProvider, name);
        if (winner) return winner;
        throw error;
      }
    },
    [dataProvider],
  );
}
