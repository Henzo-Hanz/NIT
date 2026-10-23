import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import type { ComponentProps } from "react"
import { cn } from "cn"

const DialogBackdrop = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Backdrop>) => (
  <DialogPrimitive.Backdrop
    className={cn("fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm", className)}
    {...props}
  />
)

const DialogPopup = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Popup>) => (
  <DialogPrimitive.Popup
    className={cn(
      "fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(92vw,540px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-2xl outline-none",
      className,
    )}
    {...props}
  />
)

export const Dialog = {
  Root: DialogPrimitive.Root,
  Trigger: DialogPrimitive.Trigger,
  Portal: DialogPrimitive.Portal,
  Backdrop: DialogBackdrop,
  Popup: DialogPopup,
}
