import * as React from "react"
import { Separator as SeparatorPart } from "@ui-sdk/react/separator"
import { cn } from "cn"

function Separator({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SeparatorPart>, "className"> & {
  className?: string
}) {
  return (
    <SeparatorPart
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
