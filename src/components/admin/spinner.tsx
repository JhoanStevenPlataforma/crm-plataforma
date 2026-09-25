import { useTranslate } from "ra-core";

import { HermesLoader } from "@/components/ui/hermes-loader";
import { cn } from "@/lib/utils";

const SIZE = { small: "sm", medium: "md", large: "lg" } as const;

interface SpinnerContentProps {
  size?: keyof typeof SIZE;
  show?: boolean;
  className?: string;
}

/**
 * Inline loading indicator: the Hermes caduceus laid on its side, a message
 * in transit. For a whole page waiting on content, use `Loading`.
 */
export function Spinner({
  size = "medium",
  show = true,
  className,
}: SpinnerContentProps) {
  const translate = useTranslate();
  if (!show) return null;
  return (
    <span className={cn("inline-flex items-center justify-center", className)}>
      <HermesLoader
        orientation="horizontal"
        size={SIZE[size]}
        label={translate("ra.page.loading")}
      />
    </span>
  );
}
