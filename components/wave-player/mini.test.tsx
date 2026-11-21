import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createAgent } from "@ui-sdk/react/agent"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { WavePlayerMini } from "./mini"
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

async function renderMini(children: React.ReactNode = <WavePlayerMini />, tracks = TEST_TRACKS) {
  const player = testPlayer(tracks)
  render(<WavePlayerStore store={player.store}>{children}</WavePlayerStore>)
  // Tooltips decide whether they name their trigger after mount.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  return player
}

const snapshot = (player: ReturnType<typeof testPlayer>) => player.store.getSnapshot()

test("each control is named and sends its command", async () => {
  const player = await renderMini()
  const user = userEvent.setup()

  expect(screen.getByRole("region", { name: "WavePlayer" }).dataset.kind).toBe("mini")
  expect(screen.getByText("Kevelle · Samples")).toBeTruthy()

  await user.click(screen.getByRole("button", { name: "Play" }))
  expect(snapshot(player).status.kind).toBe("loading")

  await user.click(screen.getByRole("button", { name: "Next track" }))
  expect(snapshot(player).current?.track.title).toBe("Undertow")

  await user.click(screen.getByRole("button", { name: "Previous track" }))
  expect(snapshot(player).current?.track.title).toBe("Low tide")

  const handle = await act(() => player.load())
  screen.getByRole("slider", { name: "Seek" }).focus()
  await user.keyboard("{End}")
  expect(handle.seeks).toEqual([120])

  await user.click(screen.getByRole("button", { name: "Settings" }))
  await user.click(screen.getByRole("button", { name: "Shuffle" }))
  await user.click(screen.getByRole("radio", { name: "One" }))
  await user.click(screen.getByRole("button", { name: "Mute" }))
  expect(snapshot(player).settings).toMatchObject({ shuffle: true, repeat: "one", muted: true })
})

test("the title is set in the marquee, which keeps it on one line", async () => {
  const title = "A very long track title that would wrap across several lines in the mini"
  await renderMini(<WavePlayerMini />, [{ id: "long", title, src: "/long.mp3", duration: 60 }])

  const marquee = document.querySelector('[data-slot="marquee"]')
  expect(marquee?.querySelector('[data-slot="marquee-text"]')?.textContent).toBe(title)
  expect(marquee?.getAttribute("data-play")).toBe("hover")
})

test("no status badge shows while a track loads", async () => {
  const player = await renderMini()

  await userEvent.click(screen.getByRole("button", { name: "Play" }))
  expect(snapshot(player).status.kind).toBe("loading")
  expect(document.querySelector('[data-slot="badge"]')).toBeNull()
})

test("expand renders as a link named Open player", async () => {
  await renderMini(<WavePlayerMini expand={<a href="/wave-player" />} />)

  const open = screen.getByRole("link", { name: "Open player" })
  expect(open.getAttribute("href")).toBe("/wave-player")
})

test("without expand there is no Open player", async () => {
  await renderMini()

  expect(screen.queryByRole("link", { name: "Open player" })).toBeNull()
})

test("an agent can find every control by name and drive the mini", async () => {
  const player = await renderMini(<WavePlayerMini expand={<a href="/wave-player" />} />)

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more")
  for (const entry of components) {
    expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  }
  const labels = components.map((entry) => entry.label)
  for (const label of ["Transport", "Play", "Seek", "Settings", "Open player"]) {
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

  const handle = await act(() => player.load("b.mp3"))
  const seeked = await agent.act({ steps: [{ ref: "Seek", action: "setValue", args: [45] }] })
  expect(seeked.ok, seeked.error?.message).toBe(true)
  expect(handle.seeks).toEqual([45])
})
