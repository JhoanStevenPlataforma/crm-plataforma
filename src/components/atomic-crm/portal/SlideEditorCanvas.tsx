import { useTranslate } from "ra-core";
import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "@/lib/utils";

import {
  MAX_TEXT_LENGTH,
  type SlideBox,
  type SlideElement,
} from "../quotes/portal/portalSlides";
import { SlideElementContent, SlideStage } from "../quotes/portal/SlideStage";
import {
  boxStyle,
  slideTextClass,
  slideTextStyle,
} from "../quotes/portal/slideStyles";
import {
  RESIZE_HANDLES,
  moveBox,
  removeElement,
  resizeBox,
  updateElement,
  updateText,
  type ResizeHandle,
} from "./slideEditing";

/** Where each handle sits on the selected box, and the cursor it shows. */
const HANDLE_CLASS: Record<ResizeHandle, string> = {
  nw: "-top-1.5 -left-1.5 cursor-nwse-resize",
  n: "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
  ne: "-top-1.5 -right-1.5 cursor-nesw-resize",
  e: "top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize",
  se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
  s: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
  sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
  w: "top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize",
};

/** Arrow keys nudge the selected box; with Shift, ten times as far. */
const NUDGE = 0.5;

type Gesture = {
  id: string;
  mode: "move" | ResizeHandle;
  startX: number;
  startY: number;
  startBox: SlideBox;
  width: number;
  height: number;
};

/**
 * The slide being edited, drawn by the SAME components the customer's page
 * uses (`SlideStage`, `SlideElementContent`) — what the admin arranges here is
 * what the customer sees, at any screen size, because every box is in percent
 * of the stage.
 *
 * Direct manipulation: click a box to select it, drag it to move it, drag a
 * handle to resize it, double-click a text to type in place. Arrow keys nudge,
 * Delete removes, Escape lets go.
 */
export const SlideEditorCanvas = ({
  elements,
  selectedId,
  onSelect,
  onChange,
}: {
  elements: SlideElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (elements: SlideElement[]) => void;
}) => {
  const translate = useTranslate();
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const begin = (
    event: ReactPointerEvent<HTMLElement>,
    element: SlideElement,
    mode: Gesture["mode"],
  ) => {
    event.stopPropagation();
    onSelect(element.id);
    if (editingId === element.id || event.button !== 0) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      id: element.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startBox: { x: element.x, y: element.y, w: element.w, h: element.h },
      width: rect.width,
      height: rect.height,
    };
  };

  const drag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current) return;
    const dx = ((event.clientX - current.startX) / current.width) * 100;
    const dy = ((event.clientY - current.startY) / current.height) * 100;
    const box =
      current.mode === "move"
        ? moveBox(current.startBox, dx, dy)
        : resizeBox(current.startBox, current.mode, dx, dy);
    onChange(
      updateElement(elements, current.id, (element) => ({
        ...element,
        ...box,
      })),
    );
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    if (!gesture.current) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const selected = elements.find((element) => element.id === selectedId);
    if (!selected || editingId) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onSelect(null);
      onChange(removeElement(elements, selected.id));
      return;
    }
    if (event.key === "Escape") {
      onSelect(null);
      return;
    }
    const step = event.shiftKey ? NUDGE * 10 : NUDGE;
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    onChange(
      updateElement(elements, selected.id, (element) => ({
        ...element,
        ...moveBox(element, offset[0], offset[1]),
      })),
    );
  };

  return (
    <div
      ref={stageRef}
      role="application"
      aria-label={translate("crm.portal_slides.canvas_label")}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={() => {
        onSelect(null);
        setEditingId(null);
      }}
      className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <SlideStage className="rounded-xl shadow-raised ring-1 ring-border">
        {elements.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
            {translate("crm.portal_slides.empty_slide")}
          </p>
        ) : null}
        {elements.map((element) => {
          const isSelected = element.id === selectedId;
          const isEditing = element.id === editingId;
          return (
            <div
              key={element.id}
              data-testid="slide-box"
              className={cn(
                "absolute touch-none select-none",
                isEditing ? "cursor-text" : "cursor-move",
                isSelected
                  ? "outline-2 outline-brand"
                  : "outline-1 outline-transparent hover:outline-dashed hover:outline-white/50",
              )}
              style={boxStyle(element)}
              onPointerDown={(event) => begin(event, element, "move")}
              onPointerMove={drag}
              onPointerUp={end}
              onPointerCancel={end}
              onDoubleClick={() => {
                if (element.kind === "text") setEditingId(element.id);
              }}
            >
              {element.kind === "text" && isEditing ? (
                <textarea
                  autoFocus
                  aria-label={translate("crm.portal_slides.text_label")}
                  value={element.text}
                  maxLength={MAX_TEXT_LENGTH}
                  onChange={(event) =>
                    onChange(
                      updateText(elements, element.id, {
                        text: event.target.value,
                      }),
                    )
                  }
                  onBlur={() => setEditingId(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  className={cn(
                    "size-full resize-none overflow-hidden bg-transparent p-0 outline-none",
                    slideTextClass(element),
                  )}
                  style={slideTextStyle(element)}
                />
              ) : element.kind === "text" && element.text.trim() === "" ? (
                <p className="flex size-full items-center justify-center border border-dashed border-white/40 text-xs text-white/60">
                  {translate("crm.portal_slides.text_placeholder")}
                </p>
              ) : (
                <SlideElementContent element={element} isInteractive={false} />
              )}
              {isSelected && !isEditing
                ? RESIZE_HANDLES.map((handle) => (
                    <span
                      key={handle}
                      aria-hidden
                      className={cn(
                        "absolute z-10 size-3 rounded-sm border-2 border-brand bg-white shadow",
                        HANDLE_CLASS[handle],
                      )}
                      onPointerDown={(event) => begin(event, element, handle)}
                      onPointerMove={drag}
                      onPointerUp={end}
                      onPointerCancel={end}
                    />
                  ))
                : null}
            </div>
          );
        })}
      </SlideStage>
    </div>
  );
};
