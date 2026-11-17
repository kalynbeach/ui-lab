"use client"

import * as React from "react"
import {
  Toolbar as ToolbarPart,
  ToolbarButton as ToolbarButtonPart,
  ToolbarGroup as ToolbarGroupPart,
  ToolbarSeparator as ToolbarSeparatorPart,
} from "@ui-sdk/react/toolbar"
import { cn } from "cn"

import { toggleVariants, type ToggleSize } from "./toggle"

// Toggles and toggle groups placed inside join the toolbar's arrow keys on
// their own, so there is no toolbar toggle part.
function Toolbar({
  className,
  ...props
}: Omit<React.ComponentProps<typeof ToolbarPart>, "className"> & {
  className?: string
}) {
  return (
    <ToolbarPart
      className={cn(
        "flex w-fit items-center gap-1 bg-card p-1 text-card-foreground shadow-sm ring-1 ring-foreground/10 data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ToolbarButton({
  className,
  size,
  ...props
}: Omit<React.ComponentProps<typeof ToolbarButtonPart>, "className"> & {
  className?: string
  size?: ToggleSize
}) {
  return (
    <ToolbarButtonPart
      className={cn(toggleVariants({ size }), className)}
      {...props}
    />
  )
}

function ToolbarGroup({
  className,
  ...props
}: Omit<React.ComponentProps<typeof ToolbarGroupPart>, "className"> & {
  className?: string
}) {
  return (
    <ToolbarGroupPart
      className={cn(
        "flex items-center gap-1 data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

// A separator's orientation is the way its line runs, across the toolbar.
function ToolbarSeparator({
  className,
  ...props
}: Omit<React.ComponentProps<typeof ToolbarSeparatorPart>, "className"> & {
  className?: string
}) {
  return (
    <ToolbarSeparatorPart
      className={cn(
        "shrink-0 self-stretch bg-border data-[orientation=horizontal]:my-1 data-[orientation=horizontal]:h-px data-[orientation=vertical]:mx-1 data-[orientation=vertical]:w-px",
        className
      )}
      {...props}
    />
  )
}

export { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator }
