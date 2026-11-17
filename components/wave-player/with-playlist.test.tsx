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
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width)
  const player = testPlayer(TEST_TRACKS)
  render(
    <WavePlayerStore store={player.store}>
      <WavePlayerWithPlaylist />
    </WavePlayerStore>
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  return { player, user: userEvent.setup() }
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
