import { Button } from "@ui-sdk/react/button"
import {
  Meter,
  MeterIndicator,
  MeterLabel,
  MeterTrack,
  MeterValue,
} from "@ui-sdk/react/meter"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/react/slider"
import { Toggle } from "@ui-sdk/react/toggle"
import type { Metadata } from "next"
import { buttonKeys, previews, toggleKey } from "./keys"

export const metadata: Metadata = {
  title: "Theme",
  description: "Kevelle's tokens and utilities on UI SDK parts.",
}

const ramp = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const roles = [
  ["background", "foreground"],
  ["card", "card-foreground"],
  ["popover", "popover-foreground"],
  ["primary", "primary-foreground"],
  ["primary-hover", "primary-foreground"],
  ["secondary", "secondary-foreground"],
  ["secondary-hover", "secondary-foreground"],
  ["muted", "muted-foreground"],
  ["accent", "accent-foreground"],
  ["destructive", "destructive-foreground"],
  ["destructive-subtle", "destructive"],
  ["success", "success-foreground"],
  ["success-subtle", "success"],
  ["warning", "warning-foreground"],
  ["warning-subtle", "warning"],
  ["signal", "signal-foreground"],
  ["signal-subtle", "foreground"],
] as const

const inks = [
  "border",
  "input",
  "ring",
  "faint-foreground",
  "signal-bright",
  "signal-dim",
  "link",
]

const data = ["phosphor", "astral", "flame", "magenta", "chrome"]

const typeRoles = [
  ["type-display", "Display"],
  ["type-heading-1", "Heading 1"],
  ["type-heading-2", "Heading 2"],
  ["type-heading-3", "Heading 3"],
  ["type-body-lg", "Body large"],
  ["type-body", "Body"],
  ["type-caption", "Caption"],
  ["type-label", "Label"],
  ["type-pixel", "Pixel 03:41 / 48 kHz"],
  ["type-pixel-2x", "Pixel 2x 03:41"],
  ["type-wordmark", "Wordmark"],
  ["type-code", "type-code"],
] as const

const dithers = ["dither-12", "dither-25", "dither-50", "dither-75"]

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-6 border-t pt-6">
      <h2 className="type-heading-1">{title}</h2>
      {children}
    </section>
  )
}

function Swatch({ fill, ink, name }: { fill: string; ink?: string; name: string }) {
  return (
    <li className="flex flex-col gap-2">
      <div
        className="flex h-11 items-center justify-center border px-2 type-pixel"
        style={{
          backgroundColor: `var(--${fill})`,
          color: ink ? `var(--${ink})` : undefined,
        }}
      >
        {ink ? "Aa" : null}
      </div>
      <span className="type-code break-all text-muted-foreground">{name}</span>
    </li>
  )
}

export default function ThemePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-11 px-4 py-11 sm:px-6">
      <div>
        <h1 className="type-display">Theme</h1>
        <div className="mt-2 beam text-signal" aria-hidden="true" />
      </div>

      <Section title="Neutral ramp">
        <ul className="grid grid-cols-5 gap-3 sm:grid-cols-10">
          {ramp.map((step) => (
            <Swatch key={step} fill={`neutral-${step}`} name={String(step)} />
          ))}
        </ul>
      </Section>

      <Section title="Roles">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
          {roles.map(([fill, ink]) => (
            <Swatch key={fill} fill={fill} ink={ink} name={fill} />
          ))}
        </ul>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
          {inks.map((ink) => (
            <Swatch key={ink} fill={ink} name={ink} />
          ))}
        </ul>
      </Section>

      <Section title="Data">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
          {data.map((name) => (
            <Swatch key={name} fill={name} name={name} />
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <ul className="flex flex-col divide-y">
          {typeRoles.map(([utility, sample]) => (
            <li
              key={utility}
              className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <span className="type-code shrink-0 text-muted-foreground sm:w-36">
                {utility}
              </span>
              <span className={utility}>{sample}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Keys">
        <div className="flex flex-col gap-6">
          {Object.entries(buttonKeys).map(([name, className]) => (
            <KeyRow key={name} name={name}>
              {(preview) => (
                <Button
                  className={className}
                  data-preview={preview}
                  disabled={preview === "disabled"}
                >
                  {name}
                </Button>
              )}
            </KeyRow>
          ))}
          <KeyRow name="Toggle">
            {(preview) => (
              <Toggle
                className={toggleKey}
                data-preview={preview}
                disabled={preview === "disabled"}
              >
                Loop
              </Toggle>
            )}
          </KeyRow>
          <KeyRow name="Toggle, pressed">
            {(preview) => (
              <Toggle
                className={toggleKey}
                data-preview={preview}
                disabled={preview === "disabled"}
                defaultPressed
              >
                Loop
              </Toggle>
            )}
          </KeyRow>
        </div>
      </Section>

      <Section title="Dither">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {dithers.map((utility) => (
            <li key={utility} className="flex flex-col gap-2">
              <div className={`h-11 border ${utility}`} />
              <span className="type-code text-muted-foreground">{utility}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <div className="h-3 dither-ramp text-signal" />
          <span className="type-code text-muted-foreground">dither-ramp</span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="beam text-signal" />
          <span className="type-code text-muted-foreground">beam</span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="tick-strip text-faint-foreground" />
          <div className="tick-strip h-2 text-faint-foreground [--tick-pitch:12px]" />
          <span className="type-code text-muted-foreground">tick-strip</span>
        </div>
      </Section>

      <Section title="Glow and elevation">
        <div className="flex flex-wrap items-center gap-11 px-4 py-6">
          <div className="flex flex-col items-center gap-3">
            <div className="size-6 glow bg-background text-signal" />
            <span className="type-code text-muted-foreground">glow</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="led" />
            <span className="type-code text-muted-foreground">led</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-20 w-40 items-center justify-center bg-popover shadow-float aura type-label">
              Popover
            </div>
            <span className="type-code text-muted-foreground">aura</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-20 w-40 items-center justify-center border bg-card shadow-surface type-label">
              Card
            </div>
            <span className="type-code text-muted-foreground">shadow-surface</span>
          </div>
        </div>
      </Section>

      <Section title="Controls">
        <div className="grid gap-11 sm:grid-cols-2">
          <Slider defaultValue={40} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="type-label">Volume</span>
              <SliderValue className="type-pixel text-muted-foreground tabular-nums" />
            </div>
            <SliderControl className="flex h-5 touch-none items-center select-none">
              <SliderTrack className="relative h-1 w-full dither-50 text-faint-foreground">
                <SliderIndicator className="h-full bg-primary" />
                <SliderThumb
                  aria-label="Volume"
                  className="size-3 border border-ring bg-background alloy-raised shadow-none ring-ring transition-[color,box-shadow] hover:ring-2 active:ring-2 has-focus-visible:ring-2 dark:text-signal dark:active:border-signal-bright dark:active:glow dark:has-focus-visible:border-signal-bright dark:has-focus-visible:glow dark:data-dragging:border-signal-bright dark:data-dragging:glow"
                />
              </SliderTrack>
            </SliderControl>
          </Slider>
          <Meter value={62} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <MeterLabel className="type-label">Level</MeterLabel>
              <MeterValue className="type-pixel text-muted-foreground tabular-nums" />
            </div>
            <MeterTrack className="relative flex h-2 w-full items-center overflow-hidden bg-muted dither-25 text-faint-foreground alloy-recessed dark:bg-background">
              <MeterIndicator className="h-full dither-ramp text-signal" />
            </MeterTrack>
          </Meter>
        </div>
      </Section>
    </main>
  )
}

function KeyRow({
  name,
  children,
}: {
  name: string
  children: (preview: (typeof previews)[number]) => React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="type-heading-3">{name}</h3>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
        {previews.map((preview) => (
          <li key={preview} className="flex flex-col items-start gap-2">
            <span className="type-label text-muted-foreground">{preview}</span>
            {children(preview)}
          </li>
        ))}
      </ul>
    </div>
  )
}
