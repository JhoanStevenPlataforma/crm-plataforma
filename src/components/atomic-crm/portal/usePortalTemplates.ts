import { useDataProvider, useGetList, useNotify } from "ra-core";
import { useState } from "react";

import type { CrmDataProvider } from "../providers/types";
import type { PortalTemplate } from "../quotes/portal/portalSlides";

/**
 * The portal templates and which one is open in the editor
 * (quote-portal-presentation.md §7). Opens on the ACTIVE template — the one
 * customers see — and falls back to the first when none is.
 *
 * Every action writes straight away and re-reads the list; each one is a
 * single row or a single RPC, so there is nothing to autosave here.
 */
export const usePortalTemplates = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const { data, isPending, refetch } = useGetList<PortalTemplate>(
    "portal_templates",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "id", order: "ASC" },
    },
  );
  const templates = data ?? [];
  const [openId, setOpenId] = useState<number | null>(null);

  const open =
    templates.find((template) => template.id === openId) ??
    templates.find((template) => template.is_active) ??
    templates[0] ??
    null;

  const run = async (action: () => Promise<number | void>) => {
    try {
      const toOpen = await action();
      await refetch();
      if (toOpen) setOpenId(toOpen);
      return true;
    } catch (error) {
      console.error("portal_templates.error", error);
      notify("crm.portal_slides.errors.save_failed", { type: "error" });
      return false;
    }
  };

  return {
    templates,
    isPending,
    open,
    select: setOpenId,
    activate: (id: number) =>
      run(async () => {
        await dataProvider.activatePortalTemplate(id);
        notify("crm.portal_slides.templates.activated", { type: "success" });
      }),
    saveAs: (id: number, name: string) =>
      run(() => dataProvider.duplicatePortalTemplate(id, name)),
    create: (name: string) =>
      run(async () => {
        const { data: created } = await dataProvider.create<PortalTemplate>(
          "portal_templates",
          { data: { name: name.trim() } },
        );
        return created.id;
      }),
    rename: (id: number, name: string) =>
      run(async () => {
        await dataProvider.update("portal_templates", {
          id,
          data: { name: name.trim() },
          previousData: { id },
        });
      }),
    remove: (id: number) =>
      run(async () => {
        await dataProvider.delete("portal_templates", {
          id,
          previousData: { id },
        });
        setOpenId(null);
      }),
  };
};
