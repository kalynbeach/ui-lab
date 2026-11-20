"use client"

import * as React from "react"
import {
  Tooltip as TooltipRoot,
  TooltipArrow,
  TooltipContent as TooltipContentPart,
  TooltipShortcut as TooltipShortcutPart,
  TooltipTrigger,
} from "@ui-sdk/react/tooltip"
import { useShortcutHint } from "@ui-sdk/react/shortcuts"
import { cn } from "cn"

import { Kbd } from "./kbd"

// Hover opens a tooltip after UI SDK's delay, and keyboard focus opens it at
// once. Pass `shortcut`, like "mod+k", to give the trigger aria-keyshortcuts
// and let TooltipShortcut show the keys for this platform. The tooltip only
// shows the keys; useShortcut binds them.
function Tooltip(props: React.ComponentProps<typeof TooltipRoot>) {
  return <TooltipRoot {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  children,
  ...props
}: Omit<React.ComponentProps<typeof TooltipContentPart>, "className"> & {
  className?: string
}) {
  return (
    <TooltipContentPart
      side={side}
      sideOffset={sideOffset}
      className={cn(
        "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 bg-foreground px-3 py-1.5 text-xs text-background transition-[opacity,scale] duration-(--duration-small) ease-out has-data-[slot=kbd]:pr-1.5 has-data-[slot=tooltip-shortcut]:pr-1.5 data-instant:duration-0 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
        className
      )}
      {...props}
    >
      {(state) => (
        <>
          {typeof children === "function" ? children(state) : children}
          <TooltipArrow className="size-2.5 rotate-45 bg-foreground data-[side=bottom]:-top-1.25 data-[side=left]:-right-1.25 data-[side=right]:-left-1.25 data-[side=top]:-bottom-1.25" />
        </>
      )}
    </TooltipContentPart>
  )
}

// The keys render as a Kbd, hidden from screen readers, which hear the
// trigger's aria-keyshortcuts instead.
function TooltipShortcut({
  className,
  ...props
}: Omit<React.ComponentProps<typeof TooltipShortcutPart>, "className"> & {
  className?: string
}) {
  return (
    <TooltipShortcutPart
      render={<Kbd />}
      className={cn("pointer-events-none", className)}
      {...props}
    />
  )
}

// Keys shown outside a tooltip, like a help list. The hook renders the same
// text on the server and the first client pass, then the platform's.
function KbdShortcut({
  keys,
  ...props
}: Omit<React.ComponentProps<typeof Kbd>, "children"> & { keys: string }) {
  const hint = useShortcutHint(keys)

  return (
    <Kbd aria-hidden="true" {...props}>
      {hint.text}
    </Kbd>
  )
}

export { KbdShortcut, Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger }
