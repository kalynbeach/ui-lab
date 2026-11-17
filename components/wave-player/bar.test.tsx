import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createAgent } from "@ui-sdk/react/agent"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { WavePlayerBar } from "./bar"
import { TEST_TRACKS, testPlayer } from "./testing"
import { WavePlayerStore } from "./wave-player"

const agent = createAgent()

// jsdom has no IntersectionObserver, matchMedia, or canvas contexts.
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

async function renderBar(tracks = TEST_TRACKS) {
  const player = testPlayer(tracks)
  render(
    <WavePlayerStore store={player.store}>
      <WavePlayerBar />
    </WavePlayerStore>
  )
  // Tooltips decide whether they name their trigger after mount.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  return player
}

const snapshot = (player: ReturnType<typeof testPlayer>) => player.store.getSnapshot()

const CUTS_TEXT = /\b(truncate|line-clamp-\S+|text-ellipsis|whitespace-nowrap)\b/

test("each control is named and sends its command", async () => {
  const player = await renderBar()
  const user = userEvent.setup()

  expect(screen.getByRole("region", { name: "WavePlayer" }).dataset.kind).toBe("bar")
  expect(screen.getByRole("progressbar", { name: "Progress" }).getAttribute("aria-valuetext")).toBe(
    "0:00 of 2:00"
  )

  await user.click(screen.getByRole("button", { name: "Play" }))
  expect(snapshot(player).status.kind).toBe("loading")

  await user.click(screen.getByRole("button", { name: "Next track" }))
  expect(snapshot(player).current?.track.title).toBe("Undertow")

  await user.click(screen.getByRole("button", { name: "Previous track" }))
  expect(snapshot(player).current?.track.title).toBe("Low tide")

  await user.click(screen.getByRole("button", { name: "Settings" }))
  await user.click(screen.getByRole("button", { name: "Shuffle" }))
  await user.click(screen.getByRole("radio", { name: "All" }))
  await user.click(screen.getByRole("button", { name: "Mute" }))
  expect(snapshot(player).settings).toMatchObject({ shuffle: true, repeat: "all", muted: true })
})

test("a long title is never cut off by a class", async () => {
  const title = "A very long track title that has to wrap across several lines in the bar"
  await renderBar([{ id: "long", title, src: "/long.mp3", duration: 60 }])

  const frame = screen.getByRole("region", { name: "WavePlayer" })
  for (let node: Element | null = screen.getByText(title); node && node !== frame.parentElement; node = node.parentElement) {
    expect(node.className, node.tagName).not.toMatch(CUTS_TEXT)
  }
})

test("the bar shows a skeleton until its tracks load, then the player in the same frame", async () => {
  const player = await renderBar([])
  const frame = screen.getByRole("region", { name: "WavePlayer" })

  expect(frame.querySelector("[data-slot=skeleton]")).not.toBeNull()
  expect(screen.queryByRole("button", { name: "Play" })).toBeNull()
  expect(screen.queryByRole("progressbar")).toBeNull()

  act(() => player.store.setTracks(TEST_TRACKS))

  expect(screen.getByRole("region", { name: "WavePlayer" })).toBe(frame)
  expect(frame.querySelector("[data-slot=skeleton]")).toBeNull()
  expect(screen.getByText("Low tide")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Play" })).toBeTruthy()
})

test("an agent can find every control by name and drive the bar", async () => {
  const player = await renderBar()

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more")
  for (const entry of components) {
    expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  }
  const labels = components.map((entry) => entry.label)
  for (const label of ["Transport", "Play", "Settings"]) {
    expect(labels, `${label} is missing from the snapshot`).toContain(label)
  }
  expect(components.filter((entry) => entry.component === "tooltip")).toEqual([])

  const result = await agent.act({
    steps: [
      { ref: "Play", action: "setPressed", args: [true] },
      { ref: "Transport", action: "press", args: ["Next track"] },
      { ref: "Settings", action: "setOpen", args: [true] },
      { ref: "Level", action: "setValue", args: [0.4] },
      { ref: "Repeat", action: "setValue", args: ["All"] },
      { ref: "Shuffle", action: "setPressed", args: [true] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(snapshot(player).current?.track.title).toBe("Undertow")
  expect(snapshot(player).settings).toMatchObject({ level: 0.4, repeat: "all", shuffle: true })
  expect(player.station.openStrip).toHaveBeenCalledOnce()
})
