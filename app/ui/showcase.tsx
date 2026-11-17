"use client"

import * as React from "react"
import {
  BookmarkSimpleIcon,
  ChartBarIcon,
  CopyIcon,
  DownloadSimpleIcon,
  GridFourIcon,
  InfoIcon,
  PauseIcon,
  PlayIcon,
  PushPinIcon,
  RepeatIcon,
  ShareNetworkIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  WaveformIcon,
} from "@phosphor-icons/react"
import { useShortcut } from "@ui-sdk/react/shortcuts"

import { Badge } from "@/components/ui/badge"
import { Button, type ButtonVariant } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Kbd } from "@/components/ui/kbd"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Toggle, ToggleGroup, ToggleIcon, type ToggleVariant } from "@/components/ui/toggle"
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@/components/ui/toolbar"
import {
  KbdShortcut,
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { PreviewStates } from "./preview-states"

function Section({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  const id = React.useId()

  return (
    <section aria-labelledby={id} className={`flex min-w-0 flex-col gap-4 border p-4 sm:p-6 ${className ?? ""}`}>
      <h2 id={id} className="type-label text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}

// Held states are a picture of each part, kept from agents and the tab order.
function States({
  columns,
  rows,
}: {
  columns: readonly string[]
  rows: readonly { name: string; cells: React.ReactNode[] }[]
}) {
  return (
    <div inert aria-hidden="true" className="overflow-x-auto">
      <table className="border-separate border-spacing-x-3 border-spacing-y-2">
        <thead>
          <tr>
            <th />
            {columns.map((column) => (
              <th key={column} className="text-left type-code font-normal text-muted-foreground">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <th className="pr-3 text-left type-code font-normal text-muted-foreground">{row.name}</th>
              {row.cells.map((cell, index) => (
                <td key={columns[index]}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const keyStates = ["rest", "hover", "focus", "pressed", "disabled"] as const
const preview = { rest: undefined, hover: "hover", focus: "focus", pressed: "hover active" } as const

function ButtonSection() {
  const variants: ButtonVariant[] = ["default", "secondary", "ghost"]

  return (
    <Section title="Button" className="lg:col-span-2">
      <Row>
        <Button>Render</Button>
        <Button variant="secondary">Duplicate</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="secondary" onClick={() => new Promise((resolve) => setTimeout(resolve, 1500))}>
          Save mix
        </Button>
        <Button variant="secondary" disabled>
          Unavailable
        </Button>
      </Row>
      <Row>
        <Button size="xs" variant="secondary">Extra small</Button>
        <Button size="sm" variant="secondary">Small</Button>
        <Button variant="secondary">
          <DownloadSimpleIcon data-icon="inline-start" aria-hidden="true" />
          Export
        </Button>
        <Button size="lg">Large</Button>
        <Button size="icon-xs" variant="secondary" aria-label="Pin">
          <PushPinIcon aria-hidden="true" />
        </Button>
        <Button size="icon-sm" variant="secondary" aria-label="Bookmark">
          <BookmarkSimpleIcon aria-hidden="true" />
        </Button>
        <Button size="icon" variant="secondary" aria-label="Copy">
          <CopyIcon aria-hidden="true" />
        </Button>
        <Button size="icon-lg" aria-label="Share">
          <ShareNetworkIcon aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          aria-label="Load"
          onClick={() => new Promise((resolve) => setTimeout(resolve, 1500))}
        >
          <DownloadSimpleIcon aria-hidden="true" />
        </Button>
      </Row>
      <States
        columns={[...keyStates, "pending"]}
        rows={variants.map((variant) => ({
          name: variant,
          cells: [
            ...keyStates.map((state) =>
              state === "disabled" ? (
                <Button key={state} variant={variant} disabled>
                  Render
                </Button>
              ) : (
                <Button key={state} variant={variant} data-preview={preview[state]}>
                  Render
                </Button>
              )
            ),
            <Button
              key="pending"
              variant={variant}
              pendingAnnouncement=""
              onClick={() => new Promise(() => {})}
              ref={pressOnce}
            >
              Render
            </Button>,
          ],
        }))}
      />
    </Section>
  )
}

// Leaves a held cell pending for good, so the pending state stays on show.
function pressOnce(button: HTMLButtonElement | null) {
  if (button && !button.dataset.held) {
    button.dataset.held = ""
    queueMicrotask(() => button.click())
  }
}

function ToggleSection() {
  const variants: ToggleVariant[] = ["default", "outline"]
  const states = ["rest", "hover", "focus", "pressed", "on", "disabled"] as const

  return (
    <Section title="Toggle">
      <Row>
        <Toggle size="icon" aria-label="Repeat">
          <ToggleIcon>
            <RepeatIcon />
          </ToggleIcon>
        </Toggle>
        <Toggle size="icon" aria-label="Random order" defaultPressed>
          <ToggleIcon>
            <ShuffleIcon />
          </ToggleIcon>
        </Toggle>
        <Toggle>Show peaks</Toggle>
        <Toggle disabled>Snap</Toggle>
      </Row>
      <Row>
        <ToggleGroup aria-label="Quantize" spacing={0} defaultValue={["bar"]}>
          <Toggle value="beat">Beat</Toggle>
          <Toggle value="bar">Bar</Toggle>
          <Toggle value="phrase">Phrase</Toggle>
        </ToggleGroup>
        <ToggleGroup aria-label="Channels" multiple defaultValue={["left"]}>
          <Toggle value="left">L</Toggle>
          <Toggle value="right">R</Toggle>
        </ToggleGroup>
      </Row>
      <States
        columns={states}
        rows={variants.map((variant) => ({
          name: variant,
          cells: states.map((state) => (
            <Toggle
              key={state}
              variant={variant}
              disabled={state === "disabled"}
              defaultPressed={state === "on"}
              data-preview={state === "on" || state === "disabled" ? undefined : preview[state]}
            >
              Snap
            </Toggle>
          )),
        }))}
      />
    </Section>
  )
}

function Transport() {
  const [playing, setPlaying] = React.useState(false)
  const [muted, setMuted] = React.useState(false)
  const [shuffle, setShuffle] = React.useState(false)

  useShortcut("m", () => setMuted((value) => !value), { description: "Mute" })
  useShortcut("s", () => setShuffle((value) => !value), { description: "Shuffle" })

  return (
    <Toolbar aria-label="Transport">
      <Tooltip type="label">
        <TooltipTrigger render={<ToolbarButton size="icon" />}>
          <SkipBackIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Previous</TooltipContent>
      </Tooltip>
      <Tooltip type="label">
        <TooltipTrigger
          render={<Toggle size="icon" pressed={playing} onPressedChange={setPlaying} />}
        >
          {playing ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
        </TooltipTrigger>
        <TooltipContent>Play</TooltipContent>
      </Tooltip>
      <Tooltip type="label">
        <TooltipTrigger render={<ToolbarButton size="icon" />}>
          <SkipForwardIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Next</TooltipContent>
      </Tooltip>
      <ToolbarSeparator />
      <Tooltip type="label" shortcut="s">
        <TooltipTrigger render={<Toggle size="icon" pressed={shuffle} onPressedChange={setShuffle} />}>
          <ShuffleIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>
          Shuffle
          <TooltipShortcut />
        </TooltipContent>
      </Tooltip>
      <Tooltip type="label" shortcut="m">
        <TooltipTrigger render={<Toggle size="icon" pressed={muted} onPressedChange={setMuted} />}>
          {muted ? <SpeakerSlashIcon aria-hidden="true" /> : <SpeakerHighIcon aria-hidden="true" />}
        </TooltipTrigger>
        <TooltipContent>
          Mute
          <TooltipShortcut />
        </TooltipContent>
      </Tooltip>
    </Toolbar>
  )
}

function ToolbarSection() {
  return (
    <Section title="Toolbar and tooltip">
      <Transport />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 type-body text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <KbdShortcut keys="s" /> Shuffle
        </span>
        <span className="inline-flex items-center gap-2">
          <KbdShortcut keys="m" /> Mute
        </span>
        <span className="inline-flex items-center gap-2">
          <KbdShortcut keys="mod+k" /> Search
        </span>
      </div>
      <Row>
        <Tooltip>
          <TooltipTrigger render={<Button variant="secondary" />}>Bounce</TooltipTrigger>
          <TooltipContent side="bottom">Writes a 48 kHz WAV</TooltipContent>
        </Tooltip>
        <Tooltip toggleable>
          <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label="About peaks" />}>
            <InfoIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="right">Peaks load before the track</TooltipContent>
        </Tooltip>
      </Row>
    </Section>
  )
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`

function SliderSection() {
  const states = ["rest", "hover", "focus", "drag", "disabled"] as const

  return (
    <Section title="Slider">
      <Field>
        <Slider defaultValue={72} format={{ style: "unit", unit: "percent" }}>
          <div className="flex items-center justify-between">
            <FieldLabel>Volume</FieldLabel>
            <SliderValue />
          </div>
          <SliderControl>
            <SliderTrack>
              <SliderIndicator />
              <SliderThumb />
            </SliderTrack>
          </SliderControl>
        </Slider>
      </Field>
      <Field>
        <Slider defaultValue={64} max={212} format={(seconds) => `${clock(seconds)} of ${clock(212)}`}>
          <div className="flex items-center justify-between">
            <FieldLabel>Position</FieldLabel>
            <SliderValue>{(state) => clock(state.value as number)}</SliderValue>
          </div>
          <SliderControl>
            <SliderTrack>
              <div aria-hidden="true" className="absolute inset-y-0 left-0 w-3/5 bg-faint-foreground/60" />
              <SliderIndicator />
              <SliderThumb />
            </SliderTrack>
          </SliderControl>
        </Slider>
      </Field>
      <Slider aria-label="Balance" disabled defaultValue={50} />
      <div className="flex items-end gap-6">
        {["Low", "Mid", "High"].map((band, index) => (
          <div key={band} className="flex h-full flex-col items-center gap-2">
            <Slider aria-label={band} orientation="vertical" defaultValue={[40, 65, 50][index]} />
            <span className="type-label text-muted-foreground" aria-hidden="true">
              {band}
            </span>
          </div>
        ))}
      </div>
      <States
        columns={states}
        rows={[
          {
            name: "thumb",
            cells: states.map((state) => (
              <div key={state} className="w-16">
                <Slider disabled={state === "disabled"} defaultValue={50}>
                  <SliderControl>
                    <SliderTrack>
                      <SliderIndicator />
                      <SliderThumb
                        data-preview={
                          state === "rest" || state === "disabled"
                            ? undefined
                            : { hover: "hover", focus: "focus", drag: "drag" }[state]
                        }
                      />
                    </SliderTrack>
                  </SliderControl>
                </Slider>
              </div>
            )),
          },
        ]}
      />
    </Section>
  )
}

function SegmentedSection() {
  const looks = [
    { value: "trace", label: "Trace", icon: WaveformIcon },
    { value: "bars", label: "Bars", icon: ChartBarIcon },
    { value: "grid", label: "Grid", icon: GridFourIcon },
  ]

  return (
    <Section title="Segmented control">
      <Row>
        <SegmentedControl aria-label="Look" defaultValue="trace">
          {looks.map((look) => (
            <SegmentedControlItem key={look.value} value={look.value}>
              <look.icon aria-hidden="true" />
              <span className="sr-only">{look.label}</span>
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        <SegmentedControl aria-label="Time" defaultValue="elapsed" size="sm" className="type-pixel">
          <SegmentedControlItem value="elapsed">Elapsed</SegmentedControlItem>
          <SegmentedControlItem value="remaining">Remaining</SegmentedControlItem>
        </SegmentedControl>
        <SegmentedControl aria-label="Rate" defaultValue="48" disabled>
          <SegmentedControlItem value="44">44.1</SegmentedControlItem>
          <SegmentedControlItem value="48">48</SegmentedControlItem>
        </SegmentedControl>
      </Row>
    </Section>
  )
}

function ProgressSection() {
  const [value, setValue] = React.useState(20)

  return (
    <Section title="Progress">
      <Progress value={value}>
        <ProgressLabel>Decoding</ProgressLabel>
        <ProgressValue />
      </Progress>
      <Progress value={value} size="sm" aria-label="Buffering" />
      <Progress value={null}>
        <ProgressLabel>Connecting</ProgressLabel>
      </Progress>
      <Row>
        <Button size="sm" variant="secondary" onClick={() => setValue((current) => (current >= 100 ? 0 : current + 20))}>
          Advance progress
        </Button>
      </Row>
    </Section>
  )
}

function StatusSection() {
  return (
    <Section title="Badge, spinner, separator, skeleton">
      <Row>
        <Badge>48 kHz</Badge>
        <Badge variant="secondary">24 bit</Badge>
        <Badge variant="outline">WAV</Badge>
        <Badge variant="success" face="label">Live</Badge>
        <Badge variant="warning" face="label">Clipping</Badge>
        <Badge variant="destructive" face="label">Offline</Badge>
      </Row>
      <Row>
        <Spinner />
        <Separator orientation="vertical" className="h-5" />
        <Kbd>Space</Kbd>
        <Kbd face="label">?</Kbd>
      </Row>
      <Separator />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-11 w-full" />
      </div>
    </Section>
  )
}

function PopoverSection() {
  const [loop, setLoop] = React.useState(true)

  return (
    <Section title="Popover, switch, field">
      <Row>
        <Popover>
          <PopoverTrigger render={<Button variant="secondary" />}>Details</PopoverTrigger>
          <PopoverContent>
            <PopoverTitle>Track details</PopoverTitle>
            <PopoverDescription>48 kHz, 24 bit, 3:32.</PopoverDescription>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel>Loop selection</FieldLabel>
                <Switch checked={loop} onCheckedChange={setLoop} />
              </div>
            </Field>
          </PopoverContent>
        </Popover>
        <Field className="w-fit">
          <div className="flex items-center gap-3">
            <FieldLabel>Click track</FieldLabel>
            <Switch defaultChecked={false} />
          </div>
        </Field>
        <Field className="w-fit">
          <div className="flex items-center gap-3">
            <FieldLabel>Metronome</FieldLabel>
            <Switch disabled defaultChecked />
          </div>
        </Field>
      </Row>
    </Section>
  )
}

function Showcase() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <PreviewStates />
      <ButtonSection />
      <ToggleSection />
      <ToolbarSection />
      <SliderSection />
      <SegmentedSection />
      <ProgressSection />
      <StatusSection />
      <PopoverSection />
    </div>
  )
}

export { Showcase }
