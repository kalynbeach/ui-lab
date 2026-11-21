import * as React from "react"
import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "animate-pulse dither-50 text-muted-foreground/30 motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
