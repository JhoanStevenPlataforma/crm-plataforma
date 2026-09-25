import { useInput } from "ra-core";

import { cn } from "@/lib/utils";

/**
 * A minimal colour picker compatible with ra-core's `useInput`: the browser's
 * own swatch, nothing else. Used by the note statuses in the settings.
 */
export const ColorInput = ({
  source,
  label,
  className,
}: {
  source: string;
  /** The accessible name; the swatch has no visible text. */
  label?: string;
  className?: string;
}) => {
  const { field } = useInput({ source });
  return (
    <input
      type="color"
      aria-label={label}
      {...field}
      value={field.value || "#000000"}
      className={cn(
        "w-9 h-9 shrink-0 cursor-pointer appearance-none rounded border bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:cursor-pointer [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:cursor-pointer [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-none",
        className,
      )}
    />
  );
};
