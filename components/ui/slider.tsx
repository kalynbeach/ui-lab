"use client"

import * as React from "react"
import {
  Slider as SliderPart,
  SliderControl as SliderControlPart,
  SliderIndicator as SliderIndicatorPart,
  SliderThumb as SliderThumbPart,
  SliderTrack as SliderTrackPart,
  SliderValue as SliderValuePart,
} from "@ui-sdk/react/slider"
import { cn } from "cn"

type ClassName = { className?: string }

// Without children, a slider renders one thumb and names it with aria-label.
// Compose the parts to put more inside the track, such as a buffered range.
function Slider<Value extends number | number[] = number | number[]>({
  className,
  children,
  "aria-label": label,
  ...props
}: Omit<React.ComponentProps<typeof SliderPart<Value>>, "className"> &
  ClassName) {
  return (
    <SliderPart<Value>
      aria-label={children === undefined ? undefined : label}
      className={cn(
        "group/slider flex flex-col gap-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-fit",
        className
      )}
      {...props}
    >
      {children ?? (
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb aria-label={label} />
          </SliderTrack>
        </SliderControl>
      )}
    </SliderPart>
  )
}

// The control pads half a thumb at each end, so a thumb at min or max stays
// inside the control's box.
function SliderControl({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SliderControlPart>, "className"> &
  ClassName) {
  return (
    <SliderControlPart
      className={cn(
        "relative flex items-center select-none data-disabled:opacity-50 data-[orientation=horizontal]:h-3 data-[orientation=horizontal]:w-full data-[orientation=horizontal]:px-1.5 data-[orientation=vertical]:py-1.5 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-3 data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

// The thumbs sit inside the track, so the track must not clip.
function SliderTrack({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SliderTrackPart>, "className"> &
  ClassName) {
  return (
    <SliderTrackPart
      className={cn(
        "grow dither-50 text-faint-foreground select-none data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1",
        className
      )}
      {...props}
    />
  )
}

function SliderIndicator({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SliderIndicatorPart>, "className"> &
  ClassName) {
  return (
    <SliderIndicatorPart
      className={cn("bg-primary select-none", className)}
      {...props}
    />
  )
}

// The thumb's hidden range input takes focus, so focus draws with
// has-focus-visible. A drag that starts on the track never presses the thumb,
// so data-dragging lights it as well as :active. In dark the glow takes the
// signal through text-signal.
function SliderThumb({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SliderThumbPart>, "className"> &
  ClassName) {
  return (
    <SliderThumbPart
      className={cn(
        "block size-3 shrink-0 border border-ring bg-background alloy-raised shadow-none ring-ring transition-[color,box-shadow,border-color] select-none",
        "after:absolute after:-inset-2 pointer-coarse:after:-inset-4.25",
        "not-data-disabled:hover:ring-2 active:ring-2 has-focus-visible:ring-2 data-dragging:ring-2",
        "dark:text-signal dark:active:border-signal-bright dark:active:glow dark:has-focus-visible:border-signal-bright dark:has-focus-visible:glow dark:data-dragging:border-signal-bright dark:data-dragging:glow",
        "data-disabled:pointer-events-none",
        className
      )}
      {...props}
    />
  )
}

function SliderValue({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SliderValuePart>, "className"> &
  ClassName) {
  return (
    <SliderValuePart
      className={cn("type-pixel text-muted-foreground tabular-nums", className)}
      {...props}
    />
  )
}

export {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
}
