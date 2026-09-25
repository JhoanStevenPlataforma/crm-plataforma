import { Check, CloudOff, Loader2, Plus } from "lucide-react";
import { useCanAccess, useTranslate } from "ra-core";
import { useState } from "react";
import { Navigate } from "react-router";

import { Confirm } from "@/components/admin/confirm";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import type { PortalTemplate } from "../quotes/portal/portalSlides";
import { SlideEditorCanvas } from "./SlideEditorCanvas";
import { SlideFilmstrip } from "./SlideFilmstrip";
import { SlideToolbar } from "./SlideToolbar";
import { StandardTemplateView } from "./StandardTemplateView";
import { TemplateBar } from "./TemplateBar";
import { usePortalSlides, type SaveState } from "./usePortalSlides";
import { usePortalTemplates } from "./usePortalTemplates";

/**
 * The customer portal (quote-portal-presentation.md §7): what a customer reads
 * before the quotation.
 *
 * Admins keep TEMPLATES of slides and choose which one is active: every
 * quotation issued from then on shows it, frozen as it stands that day, so
 * editing here never changes a link a customer already holds. On each slide,
 * pictures, videos and texts are placed and sized anywhere. "Predeterminada"
 * — the presentation the portal always had — is locked; "Guardar como" makes
 * an editable copy.
 */
export const PortalSlidesPage = () => {
  const translate = useTranslate();
  const { canAccess, isPending: isPendingAccess } = useCanAccess({
    resource: "portal_templates",
    action: "edit",
  });
  const templates = usePortalTemplates();

  if (isPendingAccess) return null;
  // The database refuses the writes anyway (RLS); this keeps the screen away.
  if (!canAccess) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col">
      <PageHeader
        title={translate("crm.portal_slides.title")}
        description={translate("crm.portal_slides.description")}
      />
      {templates.isPending ? (
        <Skeleton className="aspect-video w-full max-w-5xl rounded-xl" />
      ) : templates.open ? (
        <>
          <TemplateBar
            templates={templates.templates}
            open={templates.open}
            onSelect={templates.select}
            onActivate={templates.activate}
            onSaveAs={templates.saveAs}
            onCreate={templates.create}
            onRename={templates.rename}
            onDelete={templates.remove}
          />
          {templates.open.is_system ? (
            // The default template is the original designed presentation:
            // shown, never edited ("Guardar como" makes an editable copy).
            <StandardTemplateView />
          ) : (
            <TemplateEditor key={templates.open.id} template={templates.open} />
          )}
        </>
      ) : null}
    </div>
  );
};

PortalSlidesPage.path = "/portal";

/** One template's slides: editable, or shown as they are when locked. */
const TemplateEditor = ({ template }: { template: PortalTemplate }) => {
  const translate = useTranslate();
  const deck = usePortalSlides(template.id);
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<number | null>(null);

  if (deck.isPending) {
    return <Skeleton className="aspect-video w-full max-w-5xl rounded-xl" />;
  }

  if (deck.slides.length === 0) {
    return (
      <div className="flex max-w-xl flex-col items-start gap-3 rounded-xl border border-dashed p-8">
        <p className="text-sm text-muted-foreground">
          {translate("crm.portal_slides.empty_deck")}
        </p>
        <Button onClick={() => void deck.addSlide()}>
          <Plus className="size-4" />
          {translate("crm.portal_slides.add_first")}
        </Button>
      </div>
    );
  }

  const selectSlide = (id: number) => {
    setSelectedBox(null);
    void deck.select(id);
  };

  return (
    <div className="grid items-start gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
      <SlideFilmstrip
        slides={deck.slides}
        selectedId={deck.selectedId}
        selectedElements={deck.elements}
        onSelect={selectSlide}
        onAdd={() => {
          setSelectedBox(null);
          void deck.addSlide();
        }}
        onDuplicate={(id) => {
          setSelectedBox(null);
          void deck.duplicateSlide(id);
        }}
        onDelete={setToDelete}
        onMove={(id, offset) => void deck.moveSlideBy(id, offset)}
      />
      <div className="flex max-w-5xl min-w-0 flex-col gap-3">
        <>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SlideToolbar
                elements={deck.elements}
                selectedId={selectedBox}
                onSelect={setSelectedBox}
                onChange={deck.change}
              />
            </div>
            <SaveStatus state={deck.saveState} />
          </div>
          <SlideEditorCanvas
            key={deck.selectedId ?? "none"}
            elements={deck.elements}
            selectedId={selectedBox}
            onSelect={setSelectedBox}
            onChange={deck.change}
          />
          <p className="text-xs text-muted-foreground">
            {translate("crm.portal_slides.canvas_hint")}
          </p>
        </>
      </div>

      <Confirm
        isOpen={toDelete != null}
        title="crm.portal_slides.delete_title"
        content="crm.portal_slides.delete_content"
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete != null) void deck.deleteSlide(toDelete);
          setToDelete(null);
        }}
      />
    </div>
  );
};

const SaveStatus = ({ state }: { state: SaveState }) => {
  const translate = useTranslate();
  const content = {
    saved: [<Check key="i" className="size-4" />, "crm.portal_slides.saved"],
    pending: [
      <Loader2 key="i" className="size-4 animate-spin" />,
      "crm.portal_slides.saving",
    ],
    saving: [
      <Loader2 key="i" className="size-4 animate-spin" />,
      "crm.portal_slides.saving",
    ],
    failed: [
      <CloudOff key="i" className="size-4" />,
      "crm.portal_slides.save_failed",
    ],
  } as const;
  const [icon, key] = content[state];
  return (
    <span
      role="status"
      className={
        state === "failed"
          ? "flex shrink-0 items-center gap-1.5 pt-2.5 text-sm text-destructive"
          : "flex shrink-0 items-center gap-1.5 pt-2.5 text-sm text-muted-foreground"
      }
    >
      {icon}
      {translate(key)}
    </span>
  );
};
