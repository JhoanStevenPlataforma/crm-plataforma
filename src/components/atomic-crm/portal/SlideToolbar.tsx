import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BringToFront,
  ImagePlus,
  SendToBack,
  Trash2,
  Type,
} from "lucide-react";
import { useDataProvider, useNotify, useTranslate } from "ra-core";
import { useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { CrmDataProvider } from "../providers/types";
import {
  TEXT_SIZES,
  mediaKindOf,
  type SlideElement,
  type TextAlign,
  type TextColor,
  type TextSize,
} from "../quotes/portal/portalSlides";
import {
  addMediaElement,
  addTextElement,
  bringToFront,
  canAddElement,
  removeElement,
  sendToBack,
  updateElement,
  updateText,
} from "./slideEditing";

const ACCEPTED_FILES =
  "image/webp,image/jpeg,image/png,image/gif,image/avif,video/mp4,video/webm";

const ALIGN_ICONS: Record<TextAlign, ReactNode> = {
  left: <AlignLeft className="size-4" />,
  center: <AlignCenter className="size-4" />,
  right: <AlignRight className="size-4" />,
};

/** Width / height of a picture or video, read in the browser before upload. */
const aspectOf = (
  file: File,
  kind: "image" | "video",
): Promise<number | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    if (kind === "image") {
      const image = new Image();
      image.onload = () => done(image.naturalWidth / image.naturalHeight);
      image.onerror = () => done(null);
      image.src = url;
    } else {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () =>
        done(video.videoWidth / video.videoHeight || null);
      video.onerror = () => done(null);
      video.src = url;
    }
  });

/**
 * What can be added to the slide, and what can be changed on the selected box.
 * Every change goes through `onChange`, which the page autosaves.
 */
export const SlideToolbar = ({
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
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const selected = elements.find((element) => element.id === selectedId);
  const isFull = !canAddElement(elements);

  const addText = () => {
    const next = addTextElement(
      elements,
      translate("crm.portal_slides.new_text"),
    );
    onChange(next);
    onSelect(next[next.length - 1].id);
  };

  const upload = async (file: File) => {
    const kind = mediaKindOf(file);
    if (!kind) {
      notify("crm.portal_slides.errors.upload_type", { type: "error" });
      return;
    }
    setIsUploading(true);
    try {
      const [path, aspect] = await Promise.all([
        dataProvider.uploadPortalMedia(file),
        aspectOf(file, kind),
      ]);
      const next = addMediaElement(elements, { kind, path, aspect });
      onChange(next);
      onSelect(next[next.length - 1].id);
    } catch (error) {
      const key =
        error instanceof Error && error.message.startsWith("crm.")
          ? error.message
          : "crm.portal_slides.errors.upload_failed";
      notify(key, { type: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-card">
      <Button variant="outline" size="sm" onClick={addText} disabled={isFull}>
        <Type className="size-4" />
        {translate("crm.portal_slides.add_text")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInput.current?.click()}
        disabled={isFull || isUploading}
      >
        {isUploading ? <Spinner /> : <ImagePlus className="size-4" />}
        {translate("crm.portal_slides.add_media")}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_FILES}
        className="hidden"
        data-testid="portal-media-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />

      {selected ? (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          {selected.kind === "text" ? (
            <>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={selected.size}
                aria-label={translate("crm.portal_slides.text_size")}
                onValueChange={(size) =>
                  size &&
                  onChange(
                    updateText(elements, selected.id, {
                      size: size as TextSize,
                    }),
                  )
                }
              >
                {TEXT_SIZES.map((size) => (
                  <ToggleGroupItem
                    key={size}
                    value={size}
                    className="px-2.5 text-xs font-semibold uppercase"
                  >
                    {size}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={selected.align}
                aria-label={translate("crm.portal_slides.text_align")}
                onValueChange={(align) =>
                  align &&
                  onChange(
                    updateText(elements, selected.id, {
                      align: align as TextAlign,
                    }),
                  )
                }
              >
                {(Object.keys(ALIGN_ICONS) as TextAlign[]).map((align) => (
                  <ToggleGroupItem
                    key={align}
                    value={align}
                    aria-label={translate(`crm.portal_slides.align.${align}`)}
                  >
                    {ALIGN_ICONS[align]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={selected.color}
                aria-label={translate("crm.portal_slides.text_color")}
                onValueChange={(color) =>
                  color &&
                  onChange(
                    updateText(elements, selected.id, {
                      color: color as TextColor,
                    }),
                  )
                }
              >
                <ToggleGroupItem
                  value="light"
                  aria-label={translate("crm.portal_slides.color.light")}
                >
                  <span className="size-4 rounded-full border bg-white" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="dark"
                  aria-label={translate("crm.portal_slides.color.dark")}
                >
                  <span className="size-4 rounded-full border bg-neutral-950" />
                </ToggleGroupItem>
              </ToggleGroup>
            </>
          ) : (
            <Input
              className="h-8 w-56"
              maxLength={200}
              placeholder={translate("crm.portal_slides.alt_placeholder")}
              aria-label={translate("crm.portal_slides.alt_label")}
              value={selected.alt ?? ""}
              onChange={(event) =>
                onChange(
                  updateElement(elements, selected.id, (element) =>
                    element.kind === "text"
                      ? element
                      : { ...element, alt: event.target.value },
                  ),
                )
              }
            />
          )}
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title={translate("crm.portal_slides.bring_front")}
            aria-label={translate("crm.portal_slides.bring_front")}
            onClick={() => onChange(bringToFront(elements, selected.id))}
          >
            <BringToFront className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title={translate("crm.portal_slides.send_back")}
            aria-label={translate("crm.portal_slides.send_back")}
            onClick={() => onChange(sendToBack(elements, selected.id))}
          >
            <SendToBack className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:text-destructive"
            title={translate("crm.portal_slides.delete_box")}
            aria-label={translate("crm.portal_slides.delete_box")}
            onClick={() => {
              onSelect(null);
              onChange(removeElement(elements, selected.id));
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </>
      ) : (
        <p className="ml-1 text-xs text-muted-foreground">
          {translate("crm.portal_slides.toolbar_hint")}
        </p>
      )}
    </div>
  );
};
