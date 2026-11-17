"use client"

import * as React from "react"
import {
  Progress as ProgressPart,
  ProgressIndicator as ProgressIndicatorPart,
  ProgressLabel as ProgressLabelPart,
  ProgressTrack as ProgressTrackPart,
  ProgressValue as ProgressValuePart,
} from "@ui-sdk/react/progress"
import { cn } from "cn"

type ClassName = { className?: string }

// "sm" is a 3px dither line for a dense surface such as a player bar. Its odd
// height starts and ends the dither on a lit row.
function Progress({
  className,
  children,
  size = "default",
  ...props
}: Omit<React.ComponentProps<typeof ProgressPart>, "className" | "children"> &
  ClassName & { size?: "default" | "sm"; children?: React.ReactNode }) {
  return (
    <ProgressPart
      data-size={size}
      className={cn("group/progress flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPart>
  )
}

function ProgressTrack({
  className,
  ...props
}: Omit<React.ComponentProps<typeof ProgressTrackPart>, "className"> &
  ClassName) {
  return (
    <ProgressTrackPart
      className={cn(
        "relative flex h-2 w-full items-center overflow-hidden bg-muted dither-25 text-faint-foreground alloy-recessed group-data-[size=sm]/progress:h-0.75 dark:bg-background",
        className
      )}
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  ...props
}: Omit<React.ComponentProps<typeof ProgressIndicatorPart>, "className"> &
  ClassName) {
  return (
    <ProgressIndicatorPart
      className={cn(
        "h-full dither-ramp text-signal transition-[width] motion-reduce:transition-none data-indeterminate:w-1/3 data-indeterminate:animate-progress-sweep motion-reduce:data-indeterminate:w-full motion-reduce:data-indeterminate:animate-none rtl:-scale-x-100",
        className
      )}
      {...props}
    />
  )
}

function ProgressLabel({
  className,
  ...props
}: Omit<React.ComponentProps<typeof ProgressLabelPart>, "className"> &
  ClassName) {
  return <ProgressLabelPart className={cn("type-label", className)} {...props} />
}

function ProgressValue({
  className,
  ...props
}: Omit<React.ComponentProps<typeof ProgressValuePart>, "className"> &
  ClassName) {
  return (
    <ProgressValuePart
      className={cn(
        "ml-auto type-pixel text-muted-foreground tabular-nums",
        className
      )}
      {...props}
    />
  )
}

export { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue }
