import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { useTranslate } from "ra-core";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  MAX_SLIDES,
  type PortalSlide,
  type SlideElement,
} from "../quotes/portal/portalSlides";
import { SlideElements, SlideStage } from "../quotes/portal/SlideStage";

/**
 * The deck in order, as miniatures of the real slides (the same components,
 * just smaller — they are percent boxes, so no iframe or screenshot is needed).
 * The selected slide shows what is on the canvas, saved or not.
 */
export const SlideFilmstrip = ({
  slides,
  selectedId,
  selectedElements,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
}: {
  slides: PortalSlide[];
  selectedId: number | null;
  selectedElements: SlideElement[];
  onSelect: (id: number) => void;
  onAdd: () => void;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
  onMove: (id: number, offset: -1 | 1) => void;
}) => {
  const translate = useTranslate();
  const isFull = slides.length >= MAX_SLIDES;

  return (
    <nav
      aria-label={translate("crm.portal_slides.filmstrip_label")}
      className="flex flex-col gap-3"
    >
      <ol className="flex flex-col gap-3">
        {slides.map((slide, index) => {
          const isSelected = slide.id === selectedId;
          return (
            <li key={slide.id} className="group flex gap-2">
              <span className="w-4 pt-1 text-right text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(slide.id)}
                  aria-current={isSelected ? "true" : undefined}
                  aria-label={translate("crm.portal_slides.slide_n", {
                    number: index + 1,
                  })}
                  className={cn(
                    "overflow-hidden rounded-md ring-1 transition",
                    isSelected
                      ? "ring-2 ring-brand"
                      : "ring-border hover:ring-muted-foreground",
                  )}
                >
                  <SlideStage className="pointer-events-none">
                    <SlideElements
                      elements={isSelected ? selectedElements : slide.elements}
                      isInteractive={false}
                    />
                  </SlideStage>
                </button>
                <div
                  className={cn(
                    "flex justify-end gap-0.5 transition-opacity",
                    isSelected
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                  )}
                >
                  <SlideAction
                    label={translate("crm.portal_slides.move_up")}
                    disabled={index === 0}
                    onClick={() => onMove(slide.id, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </SlideAction>
                  <SlideAction
                    label={translate("crm.portal_slides.move_down")}
                    disabled={index === slides.length - 1}
                    onClick={() => onMove(slide.id, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </SlideAction>
                  <SlideAction
                    label={translate("crm.portal_slides.duplicate")}
                    disabled={isFull}
                    onClick={() => onDuplicate(slide.id)}
                  >
                    <Copy className="size-3.5" />
                  </SlideAction>
                  <SlideAction
                    label={translate("crm.portal_slides.delete_slide")}
                    onClick={() => onDelete(slide.id)}
                    isDestructive
                  >
                    <Trash2 className="size-3.5" />
                  </SlideAction>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <Button
        variant="outline"
        size="sm"
        className="ml-6"
        onClick={onAdd}
        disabled={isFull}
      >
        <Plus className="size-4" />
        {translate("crm.portal_slides.add_slide")}
      </Button>
    </nav>
  );
};

const SlideAction = ({
  label,
  onClick,
  disabled,
  isDestructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  isDestructive?: boolean;
  children: ReactNode;
}) => (
  <Button
    variant="ghost"
    size="icon"
    className={cn(
      "size-6",
      isDestructive && "text-destructive hover:text-destructive",
    )}
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </Button>
);
