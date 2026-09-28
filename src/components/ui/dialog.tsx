import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"
import { useTranslate } from "ra-core"

import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-[oklch(0.14_0.03_268/0.45)] backdrop-blur-[3px]",
        className
      )}
      {...props}
    />
  )
}

/**
 * The last element focused outside menus and dialogs; for a menu item, the
 * menu's trigger (Radix labels a menu by its trigger's id).
 *
 * Radix returns focus to whatever was focused before a dialog opened. When the
 * dialog is opened from a dropdown item ("Cancel task" in a row's menu), focus
 * has already left the vanishing item for <body> by then, so closing the
 * dialog threw a keyboard user back to the top of the page. Tracked as focus
 * moves, because by the time the dialog renders it is too late to ask.
 */
let lastFocusedOutsideOverlays: HTMLElement | null = null

if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target as HTMLElement
      if (target.closest('[role="dialog"], [role="alertdialog"]')) return
      const menu = target.closest<HTMLElement>('[role="menu"]')
      if (menu) {
        const triggerId = menu.getAttribute("aria-labelledby")
        const trigger = triggerId ? document.getElementById(triggerId) : null
        if (trigger) lastFocusedOutsideOverlays = trigger
        return
      }
      lastFocusedOutsideOverlays = target
    },
    true
  )
}

/** Where focus should return when the dialog about to open closes. */
function returnFocusTarget(): HTMLElement | null {
  if (typeof document === "undefined") return null
  const active = document.activeElement as HTMLElement | null
  if (active && active !== document.body && !active.closest('[role="menu"]')) {
    return active
  }
  return lastFocusedOutsideOverlays
}

function DialogContent({
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  const translate = useTranslate()
  // Read as the dialog opens, before it moves focus into itself. Not in a
  // render: this wrapper renders while the dialog is closed too.
  const returnTo = React.useRef<HTMLElement | null>(null)
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border bg-card p-6 shadow-float duration-200 sm:max-w-lg",
          className
        )}
        onOpenAutoFocus={(event) => {
          returnTo.current = returnFocusTarget()
          onOpenAutoFocus?.(event)
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          if (event.defaultPrevented) return
          if (returnTo.current?.isConnected) {
            event.preventDefault()
            returnTo.current.focus()
          }
        }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">
            {translate("ra.action.close", { _: "Close" })}
          </span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // A hairline above the actions, as at the foot of every record form,
        // so the buttons never read as one more field.
        "mt-2 flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
