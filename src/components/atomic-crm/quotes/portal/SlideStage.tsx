import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { portalMediaUrl, type SlideElement } from "./portalSlides";
import { boxStyle, slideTextClass, slideTextStyle } from "./slideStyles";

/**
 * The 16:9 surface every slide is drawn on. Always on the dark palette, like
 * the portal around it, and a size container so text scales with it.
 */
export const SlideStage = ({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) => (
  <div
    className={cn(
      "dark relative aspect-video w-full overflow-hidden bg-background text-foreground [container-type:inline-size]",
      className,
    )}
  >
    {children}
  </div>
);

/**
 * What one box shows. Rendered as React text and plain media elements —
 * never HTML — because on the portal it reaches anybody holding a link.
 *
 * `isInteractive` false (the editor, the thumbnails) keeps a video's controls
 * from swallowing the pointer that moves the box.
 */
export const SlideElementContent = ({
  element,
  isInteractive = true,
}: {
  element: SlideElement;
  isInteractive?: boolean;
}) => {
  if (element.kind === "text") {
    return (
      <p
        className={cn("size-full overflow-hidden", slideTextClass(element))}
        style={slideTextStyle(element)}
      >
        {element.text}
      </p>
    );
  }
  if (element.kind === "video") {
    return (
      <video
        src={portalMediaUrl(element.path)}
        aria-label={element.alt || undefined}
        controls={isInteractive}
        playsInline
        preload="metadata"
        className={cn(
          "size-full bg-black object-cover",
          !isInteractive && "pointer-events-none",
        )}
      />
    );
  }
  return (
    <img
      src={portalMediaUrl(element.path)}
      alt={element.alt ?? ""}
      loading="lazy"
      decoding="async"
      draggable={false}
      // A picture that cannot load leaves an empty box, never a broken icon.
      onError={(event) => {
        event.currentTarget.style.visibility = "hidden";
      }}
      className="size-full object-cover select-none"
    />
  );
};

/** A slide as the customer sees it: every box, in order, nothing to click. */
export const SlideElements = ({
  elements,
  isInteractive = true,
}: {
  elements: SlideElement[];
  isInteractive?: boolean;
}) =>
  elements.map((element) => (
    <div key={element.id} className="absolute" style={boxStyle(element)}>
      <SlideElementContent element={element} isInteractive={isInteractive} />
    </div>
  ));
