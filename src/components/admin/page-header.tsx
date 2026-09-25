import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The top of a screen: its title, one line saying what is in it, and the
 * screen's actions on the same row — the pattern every list, board and
 * settings page shares, so the eye finds the name and the "New" button in the
 * same place on each of them.
 *
 * The actions wrap under the title on a narrow screen instead of squeezing it.
 */
export const PageHeader = ({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
      className,
    )}
  >
    <div className="flex min-w-0 flex-col gap-1">
      <h1 className="truncate text-[1.75rem] leading-tight font-semibold">
        {title}
      </h1>
      {description ? (
        <p className="text-sm text-muted-foreground tabular-nums">
          {description}
        </p>
      ) : null}
    </div>
    {actions ? (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </div>
);
