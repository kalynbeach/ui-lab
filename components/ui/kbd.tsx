import * as React from "react"
import { cn } from "cn"

// A key reads in the pixel face. face="label" keeps the size and takes the label face.
function Kbd({
  className,
  face = "value",
  ...props
}: React.ComponentProps<"kbd"> & { face?: "value" | "label" }) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 bg-muted px-1 type-pixel text-muted-foreground select-none",
        face === "label" && "font-label",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
