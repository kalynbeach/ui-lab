"use client"

// These parts read the playhead, not the snapshot, and re-render only when
// what they draw moves.
//
// A drag or a press on the track previews. The playhead reports the target,
// so every readout shows it while the track plays on, and the release seeks
// once. A step key, a screen reader's adjust, and an agent's value seek at
// once, since an agent's value never commits. Escape or a cancelled pointer
// drops the preview, and the Slider ignores both, so the player drops it.

import * as React from "react"
import {
  SliderThumb as SliderThumbPart,
  type SliderValueChangeReason,
} from "@ui-sdk/react/slider"
import { cn } from "cn"

import { Progress } from "@/components/ui/progress"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { usePlayer, usePlayerStore } from "./context"
import { formatClock, formatRemaining, seekValueText, UNKNOWN_TIME } from "./format"
import { SEEK_THUMB } from "./frame"
import type { Need } from "./model"
import {
  BAR_PITCH,
  BAR_WIDTH,
  barCount,
  layoutBars,
  playedBars,
  playedDensity,
  rampBands,
  resamplePeaks,
  SEEK_GEOMETRY,
  type PlayedDensity,
} from "./peaks"
import { usePlayhead } from "./playhead"
import { STATUS_VIEW } from "./status-view"

type Styled = { readonly className?: string }

const ON_CHANGE = {
  drag: "preview",
  "track-press": "preview",
  "step-key": "seek",
  "accessibility-adjust": "seek",
  imperative: "seek",
  reset: "ignore",
  restore: "ignore",
} as const satisfies Record<SliderValueChangeReason, "preview" | "seek" | "ignore">

// "dropped": Escape ended the preview while the pointer still drags, so the
// rest of that drag changes nothing.
type Scrub = { readonly kind: "idle" } | { readonly kind: "previewing"; readonly track: string } | { readonly kind: "dropped" }

const IDLE: Scrub = { kind: "idle" }

function useNeed(need: Need) {
  const store = usePlayerStore("WavePlayerSeek")

  React.useEffect(() => store.retain(need), [store, need])
}

function useWidth(ref: React.RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = React.useState(fallback)

  React.useEffect(() => {
    const element = ref.current

    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width))
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [ref])

  return width
}

const LARGE_STEP = 10

// The thumb sits between whole seconds, so the Slider's first step would only
// snap to the grid. A step moves from the playhead's whole second instead.
function stepTarget(proposed: number, shown: number, position: number, max: number): number {
  if (proposed <= 0 || proposed >= max) return proposed

  const delta = proposed - shown

  return Math.floor(position) + Math.sign(delta) * (Math.abs(delta) > 1 ? LARGE_STEP : 1)
}

function useScrub(shown: number, max: number) {
  const store = usePlayerStore("WavePlayerSeek")
  const scrub = React.useRef<Scrub>(IDLE)
  const [scrubbing, setScrubbing] = React.useState(false)

  const set = React.useCallback((next: Scrub) => {
    scrub.current = next
    setScrubbing(next.kind === "previewing")
  }, [])

  const drop = React.useCallback(
    (next: Scrub) => {
      if (scrub.current.kind === "previewing") store.playhead.cancel()

      set(next)
    },
    [store, set]
  )

  React.useEffect(() => {
    if (!scrubbing) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return

      event.preventDefault()
      drop({ kind: "dropped" })
    }

    window.addEventListener("keydown", onKeyDown, true)

    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [scrubbing, drop])

  // A part that unmounts or hides mid-drag leaves no preview behind.
  React.useEffect(() => () => drop(IDLE), [drop])

  const onValueChange = (value: number, details: { reason: SliderValueChangeReason }) => {
    const action = ON_CHANGE[details.reason]
    const track = store.getSnapshot().current?.track.id ?? null

    if (details.reason === "step-key")
      store.send({ type: "seek", to: stepTarget(value, shown, store.playhead.position(), max) })
    else if (action === "seek") store.send({ type: "seek", to: value })
    if (action !== "preview" || track === null) return

    const now = scrub.current

    // A drag that outlives its track never previews the next one.
    if (now.kind === "dropped" || (now.kind === "previewing" && now.track !== track)) {
      drop({ kind: "dropped" })

      return
    }

    if (now.kind === "idle") set({ kind: "previewing", track })
    store.playhead.preview(value)
  }

  const onValueCommit = (_value: number, details: { reason: SliderValueChangeReason }) => {
    if (ON_CHANGE[details.reason] !== "preview") return

    const was = scrub.current

    set(IDLE)
    if (was.kind === "previewing") store.playhead.commit()
  }

  const control = {
    "data-scrubbing": scrubbing ? "" : undefined,
    // A press after an Escape starts a fresh scrub.
    onPointerDown: () => {
      if (scrub.current.kind === "dropped") set(IDLE)
    },
    // A cancelled pointer ends the drag with no commit.
    onPointerCancel: () => drop(IDLE),
  }

  return { scrubbing, onValueChange, onValueCommit, control }
}

// The card's content width, for the server and the first paint.
const DESIGN_WIDTH = 316

// Finer than whole seconds when the bars are finer, so the thumb keeps pace
// with the lit bars on a short track.
function grain(duration: number | null, steps: number): number {
  return duration === null || steps <= 0 ? 1 : Math.min(1, duration / steps)
}

export function WavePlayerSeek({
  appearance,
  className,
}: Styled & { readonly appearance: "waveform" | "line" }) {
  const store = usePlayerStore("WavePlayerSeek")
  const kind = usePlayer((state) => state.status.kind)
  const current = usePlayer((state) => state.current !== null)
  const duration = usePlayer((state) => state.current?.track.duration ?? null)
  const peaks = usePlayer((state) => state.current?.peaks ?? null)
  const view = STATUS_VIEW[kind]
  const track = React.useRef<HTMLDivElement>(null)
  const width = useWidth(track, DESIGN_WIDTH)
  const count = barCount(width)
  const disabled = !current || !view.seekable || duration === null

  useNeed("current")
  useNeed(appearance === "waveform" ? "peaks" : "current")

  const step = grain(duration, appearance === "waveform" ? count : width)
  const value = usePlayhead(store.playhead, (position) =>
    duration === null ? 0 : Math.min(duration, Math.floor(position / step) * step)
  )
  const scrub = useScrub(value, duration ?? 1)

  return (
    <Slider<number>
      min={0}
      max={duration ?? 1}
      step={1}
      largeStep={LARGE_STEP}
      value={value}
      disabled={disabled}
      // The value moves in steps finer than a second, so the text reads the playhead the time readout shows.
      format={() => seekValueText(store.playhead.position(), duration)}
      onValueChange={scrub.onValueChange}
      onValueCommit={scrub.onValueCommit}
      className={cn("group/seek", className)}
    >
      <SliderControl
        {...scrub.control}
        className={cn(
          "cursor-pointer data-scrubbing:cursor-grabbing data-disabled:cursor-default",
          appearance === "waveform" ? "data-[orientation=horizontal]:h-9" : "data-[orientation=horizontal]:h-6"
        )}
      >
        {appearance === "waveform" ? (
          <SliderTrack ref={track} className="relative bg-none! data-[orientation=horizontal]:h-9">
            <Bars
              width={width}
              played={playedBars(value, duration, count)}
              levels={peaks ? resamplePeaks(peaks, count) : null}
            />
            <SliderThumbPart
              aria-label="Seek"
              {...{ [SEEK_THUMB]: "" }}
              className="h-full w-0.5 bg-signal text-signal opacity-0 ring-ring transition-opacity duration-(--duration-small) group-hover/seek:opacity-100 has-focus-visible:opacity-100 has-focus-visible:ring-2 data-dragging:opacity-100 data-disabled:hidden dark:has-focus-visible:glow dark:data-dragging:glow"
            />
          </SliderTrack>
        ) : (
          <SliderTrack ref={track} className="relative data-[orientation=horizontal]:h-0.75">
            <SliderIndicator className="bg-signal dither-ramp text-signal" />
            <SliderThumb
              aria-label="Seek"
              {...{ [SEEK_THUMB]: "" }}
              className="opacity-0 transition-opacity duration-(--duration-small) group-hover/seek:opacity-100 has-focus-visible:opacity-100 data-dragging:opacity-100"
            />
          </SliderTrack>
        )}
      </SliderControl>
    </Slider>
  )
}

const GROOVE = 4

const DITHER = {
  25: [[0, 0]],
  50: [
    [0, 0],
    [1, 1],
  ],
  75: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
} as const satisfies Record<Exclude<PlayedDensity, 100>, readonly (readonly [number, number])[]>

// The kit's dither utilities tile from each element's corner. Bars of uneven
// height need one grid, so the drawing has its own tiles.
function DitherPattern({ id, density }: { readonly id: string; readonly density: keyof typeof DITHER }) {
  return (
    <pattern id={id} width={2} height={2} patternUnits="userSpaceOnUse">
      {DITHER[density].map(([x, y]) => (
        <rect key={`${x}${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </pattern>
  )
}

function Bars({
  width,
  played,
  levels,
}: {
  readonly width: number
  readonly played: number
  readonly levels: readonly number[] | null
}) {
  const id = React.useId()
  const height = SEEK_GEOMETRY.height
  const bars = React.useMemo(() => (levels ? layoutBars(levels) : null), [levels])
  const fill = (density: PlayedDensity | "faint") =>
    density === 100 ? undefined : `url(#${id}-${density})`
  const split = played === 0 ? 0 : played * BAR_PITCH - (BAR_PITCH - BAR_WIDTH)
  const groove = (height - GROOVE) / 2

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 block size-full text-faint-foreground"
    >
      <defs>
        <DitherPattern id={`${id}-faint`} density={50} />
        <g className="text-signal">
          <DitherPattern id={`${id}-25`} density={25} />
          <DitherPattern id={`${id}-50`} density={50} />
          <DitherPattern id={`${id}-75`} density={75} />
        </g>
      </defs>
      {bars ? (
        bars.map((bar, index) => {
          const density = index < played ? playedDensity(index, played) : "faint"

          return (
            <rect
              key={bar.x}
              x={bar.x}
              y={bar.y}
              width={BAR_WIDTH}
              height={bar.height}
              fill={fill(density)}
              className={density === 100 ? "fill-signal" : undefined}
            />
          )
        })
      ) : (
        <>
          <rect y={groove} width={width} height={GROOVE} fill={fill("faint")} />
          {rampBands(split).map((band) => (
            <rect
              key={band.x}
              x={band.x}
              y={groove}
              width={band.width}
              height={GROOVE}
              fill={fill(band.density)}
              className={band.density === 100 ? "fill-signal" : undefined}
            />
          ))}
        </>
      )}
    </svg>
  )
}

const wholeSeconds = (position: number) => Math.floor(position)

export function WavePlayerTime({ className }: Styled) {
  const store = usePlayerStore("WavePlayerTime")
  const known = usePlayer((state) => STATUS_VIEW[state.status.kind].times)
  const duration = usePlayer((state) => state.current?.track.duration ?? null)
  const remaining = usePlayer((state) => state.settings.time === "remaining")
  const second = usePlayhead(store.playhead, wholeSeconds)

  useNeed("current")

  const text = !known
    ? UNKNOWN_TIME
    : remaining
      ? formatRemaining(second, duration)
      : formatClock(second)

  return (
    <Tooltip type="label" shortcut="t">
      <TooltipTrigger
        render={
          <Toggle
            aria-label="Remaining time"
            variant="outline"
            size="sm"
            pressed={remaining}
            onPressedChange={(pressed) =>
              store.send({ type: "set-time", time: pressed ? "remaining" : "elapsed" })
            }
            className={cn(
              "type-pixel tabular-nums not-data-pressed:dark:text-signal-bright",
              className
            )}
          />
        }
      >
        {text}
      </TooltipTrigger>
      <TooltipContent data-agent-hidden="">
        Remaining time
        <TooltipShortcut />
      </TooltipContent>
    </Tooltip>
  )
}

export function WavePlayerProgress({ className }: Styled) {
  const store = usePlayerStore("WavePlayerProgress")
  const known = usePlayer((state) => STATUS_VIEW[state.status.kind].times)
  const duration = usePlayer((state) => state.current?.track.duration ?? null)
  const box = React.useRef<HTMLDivElement>(null)
  const width = useWidth(box, 400)
  const total = known ? duration : null

  useNeed("current")

  // Two steps per CSS pixel: one device pixel on most screens.
  const step = grain(total, width * 2)
  const value = usePlayhead(store.playhead, (position) =>
    total === null ? 0 : Math.min(total, Math.floor(position / step) * step)
  )

  return (
    <div ref={box} className={cn("w-full", className)}>
      <Progress
        size="sm"
        aria-label="Progress"
        min={0}
        max={total ?? 1}
        value={value}
        format={(seconds) => seekValueText(seconds, total)}
      />
    </div>
  )
}
