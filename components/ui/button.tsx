"use client"

import * as React from "react"
import { Button as ButtonPart } from "@ui-sdk/react/button"
import { cn } from "cn"

import { Spinner } from "./spinner"
import "./ui.css"

// Under a coarse pointer the ::after grows to 44px. Keys in a row would
// overlap their neighbors' ::after, so they widen to 44px instead.
const hitArea =
  "relative pointer-coarse:after:absolute pointer-coarse:after:inset-[min(0px,calc(50%_-_22px))] in-data-[slot=toolbar]:pointer-coarse:min-w-11 in-data-[slot=toggle-group]:pointer-coarse:min-w-11 in-data-[slot=segmented-control]:pointer-coarse:min-w-11"

const key = cn(
  "inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,translate] outline-none select-none",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring",
  "active:not-aria-disabled:not-data-pending:not-aria-[haspopup]:translate-y-px",
  "data-disabled:cursor-not-allowed data-disabled:opacity-50 data-pending:cursor-progress",
  "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  hitArea
)

const variants = {
  default:
    "border-primary bg-primary alloy-raised text-primary-foreground not-data-disabled:hover:border-primary-hover not-data-disabled:hover:bg-primary-hover",
  secondary:
    "border-border bg-secondary alloy-raised text-secondary-foreground not-data-disabled:hover:border-input not-data-disabled:hover:alloy-hover aria-expanded:border-input aria-expanded:alloy-hover",
  ghost:
    "not-data-disabled:hover:bg-muted not-data-disabled:hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
} as const

const iconPending = "data-pending:[&>svg:not([data-slot=spinner])]:hidden"

const sizes = {
  default:
    "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
  xs: "h-6 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
  sm: "h-7 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
  lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
  icon: `size-8 ${iconPending}`,
  "icon-xs": `size-6 ${iconPending} [&_svg:not([class*='size-'])]:size-3`,
  "icon-sm": `size-7 ${iconPending}`,
  "icon-lg": `size-9 ${iconPending}`,
} as const

type ButtonVariant = keyof typeof variants
type ButtonSize = keyof typeof sizes

function buttonVariants({
  variant = "default",
  size = "default",
}: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return cn(key, variants[variant], sizes[size])
}

type ButtonProps = Omit<
  React.ComponentProps<typeof ButtonPart>,
  "className" | "children"
> & {
  className?: string
  children?: React.ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
}

function Button({
  className,
  variant = "default",
  size = "default",
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPart
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {(state) => (
        <>
          {state.pending ? <Spinner aria-hidden="true" /> : null}
          {children}
        </>
      )}
    </ButtonPart>
  )
}

export { Button, buttonVariants, hitArea, type ButtonSize, type ButtonVariant }
