import { Translate } from "ra-core";
import type { ReactNode } from "react";

export const FilterCategory = ({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children?: ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    {/* A quiet section label, so the options are what the eye lands on. */}
    <h3 className="flex flex-row items-center gap-2 px-2.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase [&_svg]:size-3.5">
      {icon}
      <Translate i18nKey={label} />
    </h3>
    <div className="flex flex-wrap items-start gap-0.5 md:flex-col">
      {children}
    </div>
  </div>
);
