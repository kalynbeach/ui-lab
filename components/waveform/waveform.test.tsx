import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { DEFAULT_WAVEFORM_CONFIG, type WaveformConfig } from "./settings"
import { Waveform, WaveformProvider } from "./waveform"

// jsdom has no IntersectionObserver, matchMedia, or canvas contexts; every
// browser the waveform supports has the first two.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function Screen() {
  return (
    <WaveformProvider config={DEFAULT_WAVEFORM_CONFIG} viewTransitionName={null}>
      <Waveform form="screen" className="size-full" />
    </WaveformProvider>
  )
}

test("the screen mounts and unmounts without throwing", async () => {
  const errors = vi.spyOn(console, "error")
  const view = render(<Screen />)

  await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
  view.unmount()

  expect(errors).not.toHaveBeenCalled()
})

test("the screen renders on the server without touching browser globals", () => {
  for (const name of [
    "window",
    "document",
    "navigator",
    "location",
    "matchMedia",
    "requestAnimationFrame",
    "IntersectionObserver",
    "ResizeObserver",
    "HTMLCanvasElement",
  ])
    vi.stubGlobal(name, undefined)

  const html = renderToString(<Screen />)

  expect(html).toBe('<div class="relative size-full"></div>')
})

function Stage() {
  const [config, setConfig] = React.useState<WaveformConfig>(DEFAULT_WAVEFORM_CONFIG)

  return (
    <WaveformProvider config={config} onConfigChange={setConfig} viewTransitionName={null}>
      <Waveform form="stage" keys="page" />
    </WaveformProvider>
  )
}

test("the stage's key guide opens with ?, its switch turns page keys off, and Escape returns to the stage", async () => {
  render(<Stage />)
  const stage = screen.getByRole("button", { name: "Waveform. Press to strike it." })

  stage.focus()
  await userEvent.keyboard("?")

  const guide = screen.getByRole("dialog", { name: "Keys" })
  expect(guide.textContent).toContain("They play anywhere on this page, but not in a text field.")
  expect(document.activeElement).toBe(stage)

  const pageKeys = screen.getByRole("switch", { name: "Keys on this page" })
  expect(pageKeys.getAttribute("aria-checked")).toBe("true")

  pageKeys.focus()
  await userEvent.keyboard(" ")
  expect(pageKeys.getAttribute("aria-checked")).toBe("false")

  await userEvent.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(document.activeElement).toBe(stage)
})
