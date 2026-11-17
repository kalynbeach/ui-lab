"use client"

import * as React from "react"
import {
  Popover as PopoverRoot,
  PopoverContent as PopoverContentPart,
  PopoverDescription as PopoverDescriptionPart,
  PopoverTitle as PopoverTitlePart,
  PopoverTrigger as PopoverTriggerPart,
  type PopoverFinalFocus,
  type PopoverInitialFocus,
} from "@ui-sdk/react/popover"
import { cn } from "cn"

type FocusRef = React.RefObject<HTMLElement | null>

const AnchorContext = React.createContext<{
  readonly anchor: HTMLElement | null
  readonly setAnchor: (element: HTMLElement | null) => void
} | null>(null)

function Popover(props: React.ComponentProps<typeof PopoverRoot>) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
  const value = React.useMemo(() => ({ anchor, setAnchor }), [anchor])

  return (
    <AnchorContext value={value}>
      <PopoverRoot {...props} />
    </AnchorContext>
  )
}

type TriggerProps = Omit<
  React.ComponentProps<typeof PopoverTriggerPart>,
  "className" | "children" | "render"
> & {
  className?: string
  children?: React.ReactNode
  render?: React.ReactElement<React.HTMLAttributes<HTMLElement>>
  // ui-sdk reads the element from `render`. Kept so Kevelle call sites compile.
  nativeButton?: boolean
}

function PopoverTrigger({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped, see TriggerProps
  nativeButton,
  render,
  ...props
}: TriggerProps) {
  const context = React.use(AnchorContext)

  // A trigger hidden from everyone can't be pressed or named, so it only
  // places the content, which opens from `open`.
  if (props["aria-hidden"] === true || props["aria-hidden"] === "true") {
    const { className, children, tabIndex, "aria-hidden": hidden } = props
    const element = render ?? <button type="button" />

    return React.cloneElement(element, {
      ref: context?.setAnchor,
      className: cn(element.props.className, className),
      tabIndex,
      "aria-hidden": hidden,
      children,
    } as React.HTMLAttributes<HTMLElement>)
  }

  return <PopoverTriggerPart render={render} {...props} />
}

function PopoverContent({
  className,
  side = "bottom",
  sideOffset = 10,
  anchor,
  initialFocus,
  finalFocus,
  ...props
}: Omit<
  React.ComponentProps<typeof PopoverContentPart>,
  "className" | "initialFocus" | "finalFocus"
> & {
  className?: string
  initialFocus?: PopoverInitialFocus | boolean | FocusRef
  finalFocus?: PopoverFinalFocus | boolean | FocusRef
}) {
  const context = React.use(AnchorContext)

  return (
    <PopoverContentPart
      side={side}
      sideOffset={sideOffset}
      anchor={anchor ?? context?.anchor}
      initialFocus={toFocus(initialFocus, "auto")}
      finalFocus={toFocus(finalFocus, "trigger")}
      className={cn(
        "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 border border-border bg-popover p-2.5 text-sm text-popover-foreground shadow-float transition-[opacity,scale] duration-(--duration-small) ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
        className
      )}
      {...props}
    />
  )
}

// Base UI took booleans and refs here; ui-sdk takes keywords, elements, and getters.
function toFocus<Keyword extends string>(
  target:
    | Keyword
    | Exclude<PopoverInitialFocus, string>
    | boolean
    | FocusRef
    | undefined,
  whenTrue: Keyword
) {
  if (target === undefined) return undefined
  if (target === true) return whenTrue
  if (target === false) return "none"
  if (typeof target === "object" && "current" in target)
    return () => target.current

  return target
}

function PopoverTitle({
  className,
  ...props
}: Omit<React.ComponentProps<typeof PopoverTitlePart>, "className"> & {
  className?: string
}) {
  return (
    <PopoverTitlePart className={cn("type-heading-3", className)} {...props} />
  )
}

function PopoverDescription({
  className,
  ...props
}: Omit<React.ComponentProps<typeof PopoverDescriptionPart>, "className"> & {
  className?: string
}) {
  return (
    <PopoverDescriptionPart
      className={cn("type-body text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
}
