import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One group of fields in a record form: an icon tile, a title and a line
 * saying what the group is for, then its inputs.
 *
 * The description is not decoration: a rep filling a contact in a hurry reads
 * "How to reach them" faster than they parse the field labels under it. The
 * icon is the wayfinding on a long form — scanning a two-column form, the eye
 * lands on the tiles first — and it takes the brand tint because it marks
 * where you are, the same job the active navigation item does.
 */
export const FormSection = ({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) => (
  <section className={cn("flex flex-col gap-5", className)}>
    <header className="relative flex items-center gap-3 pb-3">
      {Icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand/20 bg-brand-tint text-brand shadow-card">
          <Icon className="size-4" aria-hidden />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="text-[0.9375rem] leading-tight font-semibold tracking-[-0.01em]">
          {title}
        </h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {/* Hairline that fades out to the right: separates the heading from
          its fields without boxing the group in. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-border via-border/70 to-transparent"
      />
    </header>
    <div className="flex flex-col gap-4">{children}</div>
  </section>
);
