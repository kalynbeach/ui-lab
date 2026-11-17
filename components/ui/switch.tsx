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
        "relative inline-flex h-[18.4px] w-8 shrink-0 items-center border border-transparent outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring data-checked:bg-primary data-unchecked:bg-input data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchThumb className="pointer-events-none block size-4 bg-background transition-transform data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0 rtl:data-checked:-translate-x-[calc(100%-2px)]" />
    </SwitchPart>
  )
}

export { Switch }
