import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export type AsideSectionProps = {
  title: string;
  children?: ReactNode;
  noGap?: boolean;
};

export function AsideSection({ title, children, noGap }: AsideSectionProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <div className="mb-6 text-sm">
        <h3 className="text-lg font-semibold">{title}</h3>
        <Separator />
        <div className={cn("pt-2 flex flex-col", { "gap-1": !noGap })}>
          {children}
        </div>
      </div>
    );
  }
  // Desktop: each section is its own small card with a quiet label, so the
  // side column reads as a stack of facts rather than one run of text.
  return (
    <section className="mb-3 rounded-xl border border-border/80 bg-card p-4 text-sm shadow-card">
      <h3 className="mb-2.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h3>
      <div className={cn("flex flex-col", { "gap-1.5": !noGap })}>
        {children}
      </div>
    </section>
  );
}
