import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground/75 selection:bg-primary selection:text-primary-foreground border-input flex h-9 w-full min-w-0 rounded-lg border bg-field px-3 py-1 shadow-card transition-[color,background-color,box-shadow,border-color] hover:border-border-strong outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 text-sm",
        "focus-visible:bg-surface focus-visible:border-ring/70 focus-visible:ring-ring/20 focus-visible:ring-[3px]",
        "aria-invalid:bg-destructive/[0.04] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
