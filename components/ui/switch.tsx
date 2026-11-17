import * as React from "react"
import { Switch as SwitchPart, SwitchThumb } from "@ui-sdk/react/switch"
import { cn } from "cn"

function Switch({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SwitchPart>, "className" | "children"> & {
  className?: string
}) {
  return (
    <SwitchPart
      className={cn(
        "peer group/switch relative inline-flex h-[18.4px] w-8 shrink-0 items-center border border-transparent transition-[background-color,border-color,box-shadow] outline-none",
        // The ::after is the hit area: 56 by 34px, and at least 50px tall under a coarse pointer.
        "after:absolute after:-inset-x-3 after:-inset-y-2 pointer-coarse:after:-inset-y-4",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        "data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchThumb className="pointer-events-none block size-4 border border-transparent bg-background alloy-raised shadow-none transition-transform data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0 rtl:data-checked:-translate-x-[calc(100%-2px)] dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground" />
    </SwitchPart>
  )
}

export { Switch }
