"use client"

import {
  createColorScheme,
  createLocalStorage,
  type ColorSchemeState,
  type ColorSchemeValue,
} from "@ui-sdk/core"
import { Preferences, usePreference } from "@ui-sdk/react/preferences"
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control"
import { useEffect } from "react"

const colorScheme = createColorScheme({
  storage: createLocalStorage("color-scheme"),
  global: true,
})

const schemes: { value: ColorSchemeValue; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

function isScheme(value: string | null): value is ColorSchemeValue {
  return schemes.some((scheme) => scheme.value === value)
}

// The Kevelle waveform engine reads a dark or light class on <html>, not data-color-scheme.
function mirrorClass({ value }: ColorSchemeState) {
  const classes = document.documentElement.classList
  classes.toggle("dark", value === "dark")
  classes.toggle("light", value === "light")
}

function ColorSchemePreferences({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    mirrorClass(colorScheme.get())
    return colorScheme.subscribe(mirrorClass)
  }, [])

  return <Preferences preferences={[colorScheme]}>{children}</Preferences>
}

function ColorSchemeControl() {
  const { value } = usePreference(colorScheme)

  return (
    <SegmentedControl
      aria-label="Theme"
      value={value}
      onValueChange={(next, details) => {
        if (!isScheme(next)) return details.cancel()
        colorScheme.set(next, { reason: details.reason, event: details.event })
      }}
      className="flex alloy-housing"
    >
      {schemes.map((scheme) => (
        <SegmentedControlItem
          key={scheme.value}
          value={scheme.value}
          className="-ml-px h-7 border border-border bg-secondary px-2 type-label text-secondary-foreground alloy-raised outline-none first:ml-0 data-unchecked:hover:z-10 data-unchecked:hover:border-input data-unchecked:hover:alloy-lit focus-visible:z-20 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring data-checked:z-10 data-checked:alloy-selected"
        >
          {scheme.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}

export { ColorSchemeControl, ColorSchemePreferences, colorScheme }
