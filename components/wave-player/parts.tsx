"use client"

// Each part reads the player itself, so a variant passes only layout classes.
// Agents find a control by whole words in its name, so no two names share
// one: Play, Previous track, Next track, Seek, Volume, Level, Mute, Shuffle,
// Repeat (Off, All, One), Settings. Tooltips are hidden from
// agents, which would otherwise list each control twice.

import * as React from "react"
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RepeatOnceIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SlidersHorizontalIcon,
  SpeakerHighIcon,
  SpeakerLowIcon,
  SpeakerSlashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { Toggle as TogglePart } from "@ui-sdk/react/toggle"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { Toggle } from "@/components/ui/toggle"
import { Toolbar, ToolbarButton } from "@/components/ui/toolbar"
import {
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Waveform } from "@/components/waveform/waveform"

import { usePlayer, usePlayerSend } from "./context"
import { formatClock, formatOrdinal } from "./format"
import type { Repeat } from "./settings"
import { FAILURE, STATUS_VIEW, timesKnown, type StatusView } from "./status-view"

type Styled = { readonly className?: string }

export type PartSize = "default" | "sm"

// The screen that mounted last holds the provider's one canvas, so a variant
// swap moves it. The overlays cover it without unmounting it.
export function WavePlayerScreen({ className }: Styled) {
  const overlay = usePlayer((state) => STATUS_VIEW[state.status.kind].overlay)
  const reason = usePlayer((state) =>
    state.status.kind === "failed" ? state.status.reason : null
  )

  return (
    <div
      data-slot="wave-player-screen"
      className={cn(
        "dark @container relative aspect-square shrink-0 overflow-hidden bg-background text-foreground",
        className
      )}
    >
      <Waveform form="screen" className="size-full" />
      {overlay === "spinner" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner aria-hidden="true" />
        </div>
      ) : null}
      {overlay === "failure" && reason ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/80 p-3 text-center">
          <WarningCircleIcon aria-hidden="true" className="size-5 text-destructive" />
          <p className="type-heading-3 @max-[10rem]:sr-only">{FAILURE[reason].title}</p>
          <p className="type-caption text-muted-foreground @max-[10rem]:sr-only">
            {FAILURE[reason].description}
          </p>
        </div>
      ) : null}
    </div>
  )
}

export function WavePlayerTitle({ className }: Styled) {
  const title = usePlayer((state) => state.current?.track.title ?? null)

  return (
    <p className={cn("type-heading-3 min-w-0 text-pretty wrap-break-word", className)}>
      {title ?? "No tracks"}
    </p>
  )
}

export function WavePlayerByline({ className }: Styled) {
  const artist = usePlayer((state) => state.current?.track.artist ?? null)
  const record = usePlayer((state) => state.current?.track.record ?? null)
  const byline = [artist, record].filter(Boolean).join(" · ")

  return byline ? (
    <p className={cn("type-caption min-w-0 text-muted-foreground wrap-break-word", className)}>
      {byline}
    </p>
  ) : null
}

export function WavePlayerStatus({ className }: Styled) {
  const badge = usePlayer((state) => STATUS_VIEW[state.status.kind].badge)

  return badge ? (
    <Badge variant={badge.variant} face="label" className={className}>
      {badge.label}
    </Badge>
  ) : null
}

export function WavePlayerDuration({ className }: Styled) {
  const duration = usePlayer((state) =>
    timesKnown(state) ? (state.current?.track.duration ?? null) : null
  )

  return (
    <span className={cn("type-pixel text-muted-foreground tabular-nums", className)}>
      {formatClock(duration)}
    </span>
  )
}

export function WavePlayerIndex({ className }: Styled) {
  const index = usePlayer((state) => state.current?.index ?? null)
  const count = usePlayer((state) => state.tracks.length)

  return index === null ? null : (
    <span className={cn("type-pixel text-muted-foreground tabular-nums", className)}>
      {formatOrdinal(index, count)}
    </span>
  )
}

// Under a coarse pointer every key grows to 44px.
const KEY = {
  default: { step: "size-9 pointer-coarse:size-11", play: "h-9 w-11 pointer-coarse:h-11" },
  sm: { step: "size-8 pointer-coarse:size-11", play: "h-8 w-10 pointer-coarse:size-11" },
} as const satisfies Record<PartSize, { step: string; play: string }>

function Glyph({ glyph }: { readonly glyph: StatusView["glyph"] }) {
  switch (glyph) {
    case "play":
      return <PlayIcon aria-hidden="true" weight="fill" />
    case "pause":
      return <PauseIcon aria-hidden="true" weight="fill" />
    case "retry":
      return <ArrowClockwiseIcon aria-hidden="true" />
    default:
      return glyph satisfies never
  }
}

// Play keeps its name in every status, so a person or an agent finds the same
// control. Pressed says it plays, and the description says what pressing does
// when that differs. A failure leaves Previous and Next on, so a person can
// move on, and turns Play off where trying again can't help, such as No Web
// Audio.
export function WavePlayerTransport({
  size = "default",
  className,
}: Styled & { readonly size?: PartSize }) {
  const send = usePlayerSend("WavePlayerTransport")
  const kind = usePlayer((state) => state.status.kind)
  const empty = usePlayer((state) => state.current === null)
  const canNext = usePlayer((state) => state.canNext)
  const stuck = usePlayer(
    (state) => state.status.kind === "failed" && !FAILURE[state.status.reason].retry
  )
  const view = STATUS_VIEW[kind]
  const description = React.useId()
  const playDisabled = empty || stuck
  const play = React.useRef<HTMLButtonElement>(null)

  // A disabled button can't hold focus, and the browser would drop it to the
  // page. Right after the commit that turns Play off, focus is still on it,
  // so it goes to the player's frame, where Space and the letter keys work.
  React.useLayoutEffect(() => {
    const key = play.current

    if (playDisabled && key && document.activeElement === key)
      key.closest<HTMLElement>('[data-slot="wave-player"]')?.focus()
  }, [playDisabled])

  return (
    <Toolbar
      aria-label="Transport"
      className={cn("gap-2 overflow-visible bg-transparent p-0 shadow-none ring-0", className)}
    >
      <Tooltip type="label" shortcut="p">
        <TooltipTrigger
          render={
            <ToolbarButton
              aria-label="Previous track"
              disabled={empty}
              className={KEY[size].step}
              onClick={() => send({ type: "previous" })}
            />
          }
        >
          <SkipBackIcon aria-hidden="true" weight="fill" />
        </TooltipTrigger>
        <TooltipContent data-agent-hidden="">
          Previous track
          <TooltipShortcut />
        </TooltipContent>
      </Tooltip>
      <Tooltip type="label" shortcut="space">
        <TooltipTrigger
          render={
            <TogglePart
              aria-label="Play"
              ref={play}
              aria-describedby={view.description && !stuck ? description : undefined}
              disabled={playDisabled}
              pressed={view.pressed}
              onPressedChange={() => send({ type: "toggle" })}
              className={cn(buttonVariants({ variant: "default" }), KEY[size].play)}
            />
          }
        >
          <Glyph glyph={view.glyph} />
        </TooltipTrigger>
        <TooltipContent data-agent-hidden="">
          Play
          <TooltipShortcut />
        </TooltipContent>
      </Tooltip>
      {view.description && !stuck ? (
        <span id={description} hidden>
          {view.description}
        </span>
      ) : null}
      <Tooltip type="label" shortcut="n">
        <TooltipTrigger
          render={
            <ToolbarButton
              aria-label="Next track"
              disabled={!canNext}
              className={KEY[size].step}
              onClick={() => send({ type: "next" })}
            />
          }
        >
          <SkipForwardIcon aria-hidden="true" weight="fill" />
        </TooltipTrigger>
        <TooltipContent data-agent-hidden="">
          Next track
          <TooltipShortcut />
        </TooltipContent>
      </Tooltip>
    </Toolbar>
  )
}

const UTILITY = { default: "icon", sm: "icon-sm" } as const satisfies Record<
  PartSize,
  "icon" | "icon-sm"
>

export function WavePlayerShuffle({
  size = "default",
  className,
}: Styled & { readonly size?: PartSize }) {
  const send = usePlayerSend("WavePlayerShuffle")
  const shuffle = usePlayer((state) => state.settings.shuffle)

  return (
    <Tooltip type="label" shortcut="s">
      <TooltipTrigger
        render={
          <Toggle
            aria-label="Shuffle"
            size={UTILITY[size]}
            pressed={shuffle}
            onPressedChange={(pressed) => send({ type: "set-shuffle", shuffle: pressed })}
            className={className}
          />
        }
      >
        <ShuffleIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent data-agent-hidden="">
        Shuffle
        <TooltipShortcut />
      </TooltipContent>
    </Tooltip>
  )
}

const REPEAT = [
  { value: "off", label: "Off", Icon: ArrowRightIcon },
  { value: "all", label: "All", Icon: RepeatIcon },
  { value: "one", label: "One", Icon: RepeatOnceIcon },
] as const satisfies readonly {
  readonly value: Repeat
  readonly label: string
  readonly Icon: React.ElementType
}[]

// Agents name an item by its text, not its aria-label.
export function WavePlayerRepeat({
  size = "default",
  className,
}: Styled & { readonly size?: PartSize }) {
  const send = usePlayerSend("WavePlayerRepeat")
  const repeat = usePlayer((state) => state.settings.repeat)

  return (
    <SegmentedControl<Repeat>
      aria-label="Repeat"
      aria-keyshortcuts="R"
      size={UTILITY[size]}
      value={repeat}
      onValueChange={(value) => {
        if (value) send({ type: "set-repeat", repeat: value })
      }}
      className={className}
    >
      {REPEAT.map(({ value, label, Icon }) => (
        <SegmentedControlItem key={value} value={value}>
          <Icon aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}

const LEVEL_WHEEL_STEP = 0.05

export function WavePlayerLevel({ className }: Styled) {
  const send = usePlayerSend("WavePlayerLevel")
  const level = usePlayer((state) => state.settings.level)
  const box = React.useRef<HTMLDivElement>(null)
  const latest = React.useRef(level)

  React.useEffect(() => {
    latest.current = level
  }, [level])

  // React's wheel listener is passive, so it can't keep the page from scrolling.
  React.useEffect(() => {
    const element = box.current

    if (!element) return

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return

      event.preventDefault()
      const step = event.deltaY < 0 ? LEVEL_WHEEL_STEP : -LEVEL_WHEEL_STEP
      const next = Math.round(Math.min(1, Math.max(0, latest.current + step)) * 100) / 100

      send({ type: "set-level", level: next })
    }

    element.addEventListener("wheel", onWheel, { passive: false })

    return () => element.removeEventListener("wheel", onWheel)
  }, [send])

  return (
    <div ref={box} className={cn("w-full", className)}>
      <Slider<number>
        aria-label="Level"
        min={0}
        max={1}
        step={0.01}
        largeStep={0.1}
        format={{ style: "percent" }}
        value={level}
        onValueChange={(value) => send({ type: "set-level", level: value })}
      />
    </div>
  )
}

export function WavePlayerMute({
  size = "default",
  className,
}: Styled & { readonly size?: PartSize }) {
  const send = usePlayerSend("WavePlayerMute")
  const muted = usePlayer((state) => state.settings.muted)

  return (
    <Tooltip type="label" shortcut="m">
      <TooltipTrigger
        render={
          <Toggle
            aria-label="Mute"
            size={UTILITY[size]}
            pressed={muted}
            onPressedChange={(pressed) => send({ type: "set-muted", muted: pressed })}
            className={className}
          />
        }
      >
        <SpeakerSlashIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent data-agent-hidden="">
        Mute
        <TooltipShortcut />
      </TooltipContent>
    </Tooltip>
  )
}

function SpeakerGlyph() {
  const level = usePlayer((state) => state.settings.level)
  const muted = usePlayer((state) => state.settings.muted)

  if (muted || level === 0) return <SpeakerSlashIcon aria-hidden="true" />

  return level < 0.5 ? (
    <SpeakerLowIcon aria-hidden="true" />
  ) : (
    <SpeakerHighIcon aria-hidden="true" />
  )
}

function Volume() {
  return (
    <div className="flex items-center gap-2.5">
      <WavePlayerMute size="sm" />
      <WavePlayerLevel />
    </div>
  )
}

export function WavePlayerVolume({
  size = "default",
  className,
}: Styled & { readonly size?: PartSize }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Volume"
        className={cn(buttonVariants({ variant: "secondary", size: UTILITY[size] }), className)}
      >
        <SpeakerGlyph />
      </PopoverTrigger>
      <PopoverContent side="top" className="w-56">
        <Volume />
      </PopoverContent>
    </Popover>
  )
}

// The small variants' one popup.
export function WavePlayerSettings({
  size = "default",
  className,
}: Styled & { readonly size?: PartSize }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Settings"
        className={cn(buttonVariants({ variant: "secondary", size: UTILITY[size] }), className)}
      >
        <SlidersHorizontalIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent side="top" className="w-60">
        <div className="flex items-center justify-between gap-2">
          <WavePlayerShuffle size="sm" />
          <WavePlayerRepeat size="sm" />
        </div>
        <Volume />
      </PopoverContent>
    </Popover>
  )
}
