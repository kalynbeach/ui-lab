import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { TEST_TRACKS, testPlayer } from "./testing"
import { WavePlayerStore } from "./wave-player"
import { WavePlayerWithPlaylist } from "./with-playlist"

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

async function renderWithPlaylist({ width = 390 } = {}) {
  const measures: ResizeObserverCallback[] = []
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        measures.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width)
  const player = testPlayer(TEST_TRACKS)
  render(
    <WavePlayerStore store={player.store}>
      <WavePlayerWithPlaylist />
    </WavePlayerStore>
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  return {
    player,
    user: userEvent.setup(),
    /** The container takes a new width. `first` runs before the width is measured, as a browser's own blur can. */
    resize(next: number, first?: () => void) {
      clientWidth.mockReturnValue(next)
      act(() => {
        first?.()
        for (const measure of measures) measure([], {} as ResizeObserver)
      })
    },
  }
}

const openPlaylist = () => screen.getByRole("button", { name: "Open Playlist" })
const row = (title: string) =>
  within(screen.getByRole("grid", { name: "Playlist" }))
    .getAllByRole("row")
    .find((element) => element.textContent?.includes(title))!

test("a wide container shows the Playlist beside the card, with no Playlist control", async () => {
  await renderWithPlaylist({ width: 1400 })

  const frame = screen.getByRole("region", { name: "WavePlayer" })
  expect(within(frame).getByRole("grid", { name: "Playlist" })).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Open Playlist" })).toBeNull()
})

test("a narrow container opens the Playlist as a panel, and Escape returns focus to its control", async () => {
  const { user } = await renderWithPlaylist()

  expect(screen.queryByRole("grid")).toBeNull()

  await user.click(openPlaylist())
  const panel = await screen.findByRole("dialog", { name: "Playlist" })
  expect(within(panel).getByRole("grid", { name: "Playlist" })).toBeTruthy()
  await waitFor(() => expect(document.activeElement?.closest('[role="grid"]')).not.toBeNull())
  expect(panel.contains(document.activeElement)).toBe(true)

  await user.keyboard("{Escape}")
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(document.activeElement).toBe(openPlaylist())
})

test("Close in the panel closes it", async () => {
  const { user } = await renderWithPlaylist()

  await user.click(openPlaylist())
  await user.click(await screen.findByRole("button", { name: "Close" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(document.activeElement).toBe(openPlaylist())
})

test("in the panel, a row click only selects, and the row's Play plays", async () => {
  const { player, user } = await renderWithPlaylist()

  await user.click(openPlaylist())
  await screen.findByRole("dialog", { name: "Playlist" })

  await user.click(within(row("Shoal")).getAllByRole("gridcell")[0])
  expect(player.store.getSnapshot().selected).toBe("c")
  expect(player.station.openStrip).not.toHaveBeenCalled()

  await user.click(within(row("Undertow")).getByRole("button", { name: "Play Undertow" }))
  expect(player.station.openStrip).toHaveBeenCalledOnce()
  expect(player.store.getSnapshot().current?.track.title).toBe("Undertow")
})

test("Space on a row in the panel toggles playback, as it does in the frame", async () => {
  const { player, user } = await renderWithPlaylist()

  await user.click(openPlaylist())
  await screen.findByRole("dialog", { name: "Playlist" })
  within(row("Low tide")).getAllByRole("gridcell")[0].focus()

  await user.keyboard(" ")
  expect(player.store.getSnapshot().status.kind).toBe("loading")
})

test("turning wide with the panel open moves focus to the Playlist beside the card", async () => {
  const { user, resize } = await renderWithPlaylist()

  await user.click(openPlaylist())
  const panel = await screen.findByRole("dialog", { name: "Playlist" })
  await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))

  resize(1400)

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  const grid = screen.getByRole("grid", { name: "Playlist" })
  await waitFor(() => expect(grid.contains(document.activeElement)).toBe(true))
})

test("turning wide moves focus from Open Playlist to the Playlist beside the card", async () => {
  const { resize } = await renderWithPlaylist()
  const control = openPlaylist()
  act(() => control.focus())

  // Chrome drops the focus from the hidden control before the width is measured.
  resize(1400, () => control.blur())

  const grid = screen.getByRole("grid", { name: "Playlist" })
  expect(grid.contains(document.activeElement)).toBe(true)
})

test("turning wide with the panel closed leaves focus where it was", async () => {
  const { resize } = await renderWithPlaylist()
  const play = screen.getByRole("button", { name: "Play" })
  act(() => play.focus())

  resize(1400)

  expect(screen.getByRole("grid", { name: "Playlist" })).toBeTruthy()
  expect(document.activeElement).toBe(play)
})

test("turning narrow moves focus from a Playlist row to Open Playlist", async () => {
  const { resize } = await renderWithPlaylist({ width: 1400 })
  const cell = within(row("Low tide")).getAllByRole("gridcell")[0]
  act(() => cell.focus())

  // Chrome drops the focus from the hidden row before the width is measured.
  resize(390, () => cell.blur())

  expect(screen.queryByRole("grid")).toBeNull()
  expect(document.activeElement).toBe(openPlaylist())
})

test("turning narrow moves focus to Open Playlist when the row keeps the focus until it is removed", async () => {
  const { resize } = await renderWithPlaylist({ width: 1400 })
  const cell = within(row("Low tide")).getAllByRole("gridcell")[0]
  act(() => cell.focus())

  resize(390)

  expect(screen.queryByRole("grid")).toBeNull()
  expect(document.activeElement).toBe(openPlaylist())
})

test("a new width leaves the focus on an element that took it after the hidden part lost it", async () => {
  const { resize } = await renderWithPlaylist({ width: 1400 })
  const cell = within(row("Low tide")).getAllByRole("gridcell")[0]
  const play = screen.getByRole("button", { name: "Play" })
  act(() => cell.focus())

  resize(390, () => {
    cell.blur()
    play.focus()
  })

  expect(screen.queryByRole("grid")).toBeNull()
  expect(document.activeElement).toBe(play)
})

test("a new width leaves the focus on the page when another control lost it", async () => {
  const { resize } = await renderWithPlaylist()
  const play = screen.getByRole("button", { name: "Play" })
  act(() => play.focus())

  resize(1400, () => play.blur())

  expect(screen.getByRole("grid", { name: "Playlist" })).toBeTruthy()
  expect(document.activeElement).toBe(document.body)
})
