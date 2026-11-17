"use client"

import * as React from "react"
import {
  Toggle as TogglePart,
  ToggleGroup as ToggleGroupPart,
  ToggleIcon,
} from "@ui-sdk/react/toggle"
import { cn } from "cn"

import { hitArea } from "./button"
import "./ui.css"

const key = cn(
  "inline-flex shrink-0 items-center justify-center gap-1 border alloy-raised bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,translate] outline-none select-none",
  "not-data-pressed:not-data-checked:not-data-disabled:hover:border-input not-data-pressed:not-data-checked:not-data-disabled:hover:alloy-hover data-pressed:alloy-selected",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring",
  "active:not-aria-disabled:not-aria-[haspopup]:translate-y-px",
  "data-disabled:cursor-not-allowed data-disabled:opacity-50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  hitArea
)

const variants = {
  default: "border-border bg-secondary text-secondary-foreground",
  outline: "border-border bg-background text-foreground",
} as const

const sizes = {
  default:
    "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
  sm: "h-7 min-w-7 px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
  lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
  icon: "size-8",
  "icon-sm": "size-7",
  "icon-lg": "size-9",
} as const

type ToggleVariant = keyof typeof variants
type ToggleSize = keyof typeof sizes

function toggleVariants({
  variant = "default",
  size = "default",
}: { variant?: ToggleVariant; size?: ToggleSize } = {}) {
  return cn(key, variants[variant], sizes[size])
}

type Spacing = 0 | 1 | 2

const GroupContext = React.createContext<{
  variant?: ToggleVariant
  size?: ToggleSize
  spacing: Spacing
} | null>(null)

// A joined group overlaps its hairlines, so the hovered, pressed, or focused
// key rises above its neighbors to show all four edges.
const joined =
  "in-data-[spacing=0]:not-first:data-[orientation=horizontal]:-ml-px in-data-[spacing=0]:not-first:data-[orientation=vertical]:-mt-px in-data-[spacing=0]:hover:z-1 in-data-[spacing=0]:data-pressed:z-2 in-data-[spacing=0]:focus-visible:z-10"

type ToggleProps = Omit<
  React.ComponentProps<typeof TogglePart>,
  "className"
> & {
  className?: string
  variant?: ToggleVariant
  size?: ToggleSize
}

function Toggle({ className, variant, size, ...props }: ToggleProps) {
  const group = React.use(GroupContext)

  return (
    <TogglePart
      className={cn(
        toggleVariants({
          variant: variant ?? group?.variant,
          size: size ?? group?.size,
        }),
        group && cn("in-data-[slot=toggle-group]:type-pixel", joined),
        className
      )}
      {...props}
    />
  )
}

const gaps = { 0: "gap-0 alloy-housing", 1: "gap-1", 2: "gap-2" } as const

type ToggleGroupProps<T extends string> = Omit<
  React.ComponentProps<typeof ToggleGroupPart<T>>,
  "className"
> & {
  className?: string
  variant?: ToggleVariant
  size?: ToggleSize
  spacing?: Spacing
}

function ToggleGroup<T extends string = string>({
  className,
  variant,
  size,
  spacing = 2,
  ...props
}: ToggleGroupProps<T>) {
  const context = React.useMemo(
    () => ({ variant, size, spacing }),
    [variant, size, spacing]
  )

  return (
    <GroupContext value={context}>
      <ToggleGroupPart<T>
        data-spacing={spacing}
        className={cn(
          "flex w-fit items-center data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
          gaps[spacing],
          className
        )}
        {...props}
      />
    </GroupContext>
  )
}

export {
  Toggle,
  ToggleGroup,
  ToggleIcon,
  toggleVariants,
  type ToggleSize,
  type ToggleVariant,
}
