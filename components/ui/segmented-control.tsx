"use client"

import * as React from "react"
import {
  SegmentedControl as SegmentedControlPart,
  SegmentedControlItem as SegmentedControlItemPart,
} from "@ui-sdk/react/segmented-control"
import { cn } from "cn"

import { toggleVariants, type ToggleSize } from "./toggle"

const SizeContext = React.createContext<ToggleSize>("icon")

// A radio group of joined keys. Arrows move and check together. Agents name
// items by their text, so an icon-only item carries sr-only text, not aria-label.
function SegmentedControl<T extends string = string>({
  className,
  size = "icon",
  ...props
}: Omit<React.ComponentProps<typeof SegmentedControlPart<T>>, "className"> & {
  className?: string
  size?: ToggleSize
}) {
  return (
    <SizeContext value={size}>
      <SegmentedControlPart<T>
        className={cn(
          "flex w-fit items-center alloy-housing data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
          className
        )}
        {...props}
      />
    </SizeContext>
  )
}

function SegmentedControlItem({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SegmentedControlItemPart>, "className"> & {
  className?: string
}) {
  const size = React.use(SizeContext)

  return (
    <SegmentedControlItemPart
      className={cn(
        toggleVariants({ size }),
        "data-checked:alloy-selected",
        "not-first:in-data-[orientation=horizontal]:-ml-px not-first:in-data-[orientation=vertical]:-mt-px hover:z-1 data-checked:z-2 focus-visible:z-10",
        className
      )}
      {...props}
    />
  )
}

export { SegmentedControl, SegmentedControlItem }
