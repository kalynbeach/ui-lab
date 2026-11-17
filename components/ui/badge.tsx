import * as React from "react"
import { cn } from "cn"

const variants = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border-border text-foreground",
  destructive: "bg-destructive-subtle text-destructive",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
} as const

// A badge is a value in the pixel face. face="label" keeps the size and takes
// the label face, for a status or a tag.
function Badge({
  className,
  variant = "default",
  face = "value",
  ...props
}: React.ComponentProps<"span"> & {
  variant?: keyof typeof variants
  face?: "value" | "label"
}) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border border-transparent px-1.5 py-0.5 type-pixel whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3!",
        variants[variant],
        face === "label" && "font-label",
        className
      )}
      {...props}
    />
  )
}

export { Badge }
