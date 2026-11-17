"use client"

import * as React from "react"
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog"
import { cn } from "cn"

// A modal panel against the end edge, over a dithered backdrop. It slides on
// Kevelle's curve and never fades, so closing shows no flash.
function DialogPanel({
  className,
  ...props
}: Omit<React.ComponentProps<typeof DialogContent>, "className"> & {
  className?: string
}) {
  return (
    <>
      <DialogBackdrop className="fixed inset-0 bg-backdrop dither-50 text-backdrop transition-opacity duration-(--duration-large) ease-out data-ending-style:opacity-0 data-ending-style:duration-(--duration-small) data-starting-style:opacity-0 motion-reduce:transition-none" />
      <DialogContent
        className={cn(
          "fixed inset-y-0 end-0 m-0 flex h-dvh max-h-none w-[min(22rem,calc(100vw-2rem))] max-w-none flex-col overflow-y-auto border-s border-border bg-popover text-popover-foreground shadow-float outline-none",
          "transition-[translate] duration-(--duration-large) ease-out data-ending-style:duration-(--duration-small) motion-reduce:transition-none",
          "data-starting-style:translate-x-full data-ending-style:translate-x-full rtl:data-starting-style:-translate-x-full rtl:data-ending-style:-translate-x-full",
          className
        )}
        {...props}
      />
    </>
  )
}

export { Dialog, DialogClose, DialogPanel, DialogTitle, DialogTrigger }
