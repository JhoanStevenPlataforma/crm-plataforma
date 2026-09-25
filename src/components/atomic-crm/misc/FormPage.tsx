import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The centred column a create / edit screen sits in: title, form and footer
 * share one axis in the middle of the page instead of hugging its left edge.
 * `wide` is for an edit screen with an aside next to the form, `narrow` for a
 * single-column form with a handful of fields.
 */
export const FormPage = ({
  children,
  wide = false,
  narrow = false,
}: {
  children: ReactNode;
  wide?: boolean;
  narrow?: boolean;
}) => (
  <div
    className={cn(
      "mx-auto flex w-full flex-col",
      wide ? "max-w-6xl" : narrow ? "max-w-2xl" : "max-w-4xl",
    )}
  >
    {children}
  </div>
);
