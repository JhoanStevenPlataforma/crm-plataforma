import { useDataProvider, useGetList, useNotify, useUpdate } from "ra-core";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PortalSlide, SlideElement } from "../quotes/portal/portalSlides";
import { moveSlide, renumber } from "./slideEditing";

/** How long after the last change the slide is saved. */
const AUTOSAVE_DELAY_MS = 600;

export type SaveState = "saved" | "saving" | "pending" | "failed";

type Draft = { id: number; elements: SlideElement[] };

/**
 * One template's slides and the slide being edited
 * (quote-portal-presentation.md §7). Mount it once per template (the editor is
 * keyed by the template id), so switching templates saves what is pending and
 * starts clean.
 *
 * The slide on the canvas is a local DRAFT, saved by itself a moment after the
 * last change — there is no save button. The draft is taken from the server
 * only when another slide is selected, so a save arriving while somebody keeps
 * typing never puts back an older text. Leaving a slide (or the page) saves
 * what is pending first.
 */
export const usePortalSlides = (templateId: number) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  // Through `useUpdate`, not the provider directly: a pessimistic update also
  // writes the saved slide into the list's cache, so the filmstrip and the next
  // visit to this slide read what was saved.
  const [update] = useUpdate<PortalSlide>();
  const { data, isPending, refetch } = useGetList<PortalSlide>(
    "portal_slides",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "position", order: "ASC" },
      filter: { template_id: templateId },
    },
  );
  const slides = data ?? [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const pending = useRef<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const toSave = pending.current;
    if (!toSave) return;
    pending.current = null;
    setSaveState("saving");
    try {
      await update(
        "portal_slides",
        {
          id: toSave.id,
          data: { elements: toSave.elements },
          previousData: { id: toSave.id } as PortalSlide,
        },
        { mutationMode: "pessimistic", returnPromise: true },
      );
      setSaveState(pending.current ? "pending" : "saved");
    } catch (error) {
      console.error("portal_slides.save.error", error);
      setSaveState("failed");
      notify("crm.portal_slides.errors.save_failed", { type: "error" });
    }
  }, [update, notify]);

  // The first slide is selected once the deck arrives; a deleted one hands the
  // selection to whatever is now first.
  const current = slides.find((slide) => slide.id === selectedId) ?? slides[0];
  useEffect(() => {
    if (current && current.id !== draft?.id) {
      setSelectedId(current.id);
      setDraft({ id: current.id, elements: current.elements });
    }
    if (!current && draft) setDraft(null);
  }, [current, draft]);

  // Whatever is pending is saved when the editor closes.
  useEffect(() => () => void flush(), [flush]);

  const select = async (id: number) => {
    if (id === draft?.id) return;
    await flush();
    const slide = slides.find((candidate) => candidate.id === id);
    if (!slide) return;
    setSelectedId(id);
    setDraft({ id, elements: slide.elements });
  };

  /** A change on the canvas: shown at once, saved a moment later. */
  const change = (elements: SlideElement[]) => {
    if (!draft) return;
    const next = { id: draft.id, elements };
    setDraft(next);
    pending.current = next;
    setSaveState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  };

  /**
   * Structural changes write straight away, then re-read the deck. `write` may
   * name a slide to open afterwards — selected only once the re-read deck
   * holds it, or the first-slide fallback above would take the selection.
   */
  const restructure = async (write: () => Promise<number | void>) => {
    await flush();
    let toSelect: number | void = undefined;
    try {
      toSelect = await write();
    } catch (error) {
      console.error("portal_slides.structure.error", error);
      notify("crm.portal_slides.errors.save_failed", { type: "error" });
    }
    // `refetch()` resolves with the raw query result, whose `data` is the
    // provider's `{ data, total }` envelope -- not the list the hook exposes,
    // whatever its type says.
    const { data: fresh } = (await refetch()) as unknown as {
      data?: { data?: PortalSlide[] };
    };
    const selected = toSelect
      ? fresh?.data?.find((slide) => slide.id === toSelect)
      : undefined;
    if (selected) {
      setSelectedId(selected.id);
      setDraft({ id: selected.id, elements: selected.elements });
    }
  };

  const writePositions = (ordered: PortalSlide[]) =>
    Promise.all(
      renumber(ordered).map(({ id, position }) =>
        dataProvider.update("portal_slides", {
          id,
          data: { position },
          previousData: { id },
        }),
      ),
    );

  const addSlide = (elements: SlideElement[] = []) =>
    restructure(async () => {
      const { data: created } = await dataProvider.create<PortalSlide>(
        "portal_slides",
        {
          data: { template_id: templateId, position: slides.length, elements },
        },
      );
      return created.id;
    });

  const duplicateSlide = (id: number) => {
    const index = slides.findIndex((slide) => slide.id === id);
    const source = index >= 0 ? slides[index] : null;
    if (!source) return Promise.resolve();
    const elements = draft?.id === id ? draft.elements : source.elements;
    return restructure(async () => {
      const { data: created } = await dataProvider.create<PortalSlide>(
        "portal_slides",
        {
          data: { template_id: templateId, position: slides.length, elements },
        },
      );
      // Right after its original, not at the end.
      await writePositions(
        moveSlide([...slides, created], slides.length, index + 1),
      );
      return created.id;
    });
  };

  const deleteSlide = (id: number) =>
    restructure(async () => {
      if (pending.current?.id === id) pending.current = null;
      await dataProvider.delete("portal_slides", {
        id,
        previousData: { id },
      });
      await writePositions(slides.filter((slide) => slide.id !== id));
    });

  const moveSlideBy = (id: number, offset: -1 | 1) => {
    const index = slides.findIndex((slide) => slide.id === id);
    return restructure(async () => {
      await writePositions(moveSlide(slides, index, index + offset));
    });
  };

  return {
    slides,
    isPending,
    selectedId: draft?.id ?? null,
    elements: draft?.elements ?? [],
    saveState,
    select,
    change,
    addSlide,
    duplicateSlide,
    deleteSlide,
    moveSlideBy,
  };
};
