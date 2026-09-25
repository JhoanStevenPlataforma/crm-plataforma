import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground/75 focus-visible:bg-surface focus-visible:border-ring/70 focus-visible:ring-ring/20 aria-invalid:bg-destructive/[0.04] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex field-sizing-content min-h-24 w-full rounded-lg border bg-field px-3 py-2 leading-relaxed shadow-card transition-[color,background-color,box-shadow,border-color] outline-none hover:border-border-strong focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
