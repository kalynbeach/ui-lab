import { existsSync } from "node:fs"

import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createAgent } from "@ui-sdk/react/agent"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { TEST_TRACKS, testPlayer } from "@/components/wave-player/testing"
import { WavePlayerStore } from "@/components/wave-player/wave-player"

import { Gallery, GalleryFromUrl } from "./gallery"
import { VARIANTS, type VariantId } from "./variants"

const params = vi.hoisted(() => ({ search: "" }))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(params.search),
}))

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
  params.search = ""
})

async function renderGallery(children: React.ReactNode) {
  const player = testPlayer(TEST_TRACKS)
  render(<WavePlayerStore store={player.store}>{children}</WavePlayerStore>)
  // Tooltips decide whether they name their trigger after mount.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  return { player, user: userEvent.setup() }
}

const frames = () => document.querySelectorAll('[data-slot="wave-player"]')
const variant = (label: string) => screen.getByRole("radio", { name: label })

test("shows one variant at a time, and a swap keeps the same store playing", async () => {
  const changes: VariantId[] = []
  const { player, user } = await renderGallery(
    <Gallery variant="card" onVariantChange={(id) => changes.push(id)} />
  )

  expect(frames()).toHaveLength(1)
  expect(variant("Card").getAttribute("aria-checked")).toBe("true")
  expect(screen.queryByRole("button", { name: "Open Playlist" })).toBeNull()

  await user.click(screen.getByRole("button", { name: "Play" }))
  await act(() => player.load())
  expect(player.store.getSnapshot().status.kind).toBe("playing")

  await user.click(variant("Card + Playlist"))
  expect(frames()).toHaveLength(1)
  expect(screen.getByRole("button", { name: "Open Playlist" })).toBeTruthy()
  expect(player.store.getSnapshot().status.kind).toBe("playing")

  await user.click(variant("Playlist"))
  expect(frames()).toHaveLength(1)
  expect(screen.queryByRole("button", { name: "Play" })).toBeNull()
  expect(screen.getByRole("grid", { name: "Playlist" })).toBeTruthy()
  expect(player.store.getSnapshot().status.kind).toBe("playing")

  expect(player.station.openStrip).toHaveBeenCalledOnce()
  expect(player.strips[0].stop).not.toHaveBeenCalled()
  expect(changes).toEqual(["with-playlist", "playlist"])
})

test("every variant has the route the gallery links to", () => {
  for (const { id } of VARIANTS) {
    const route = `app/wave-player/${id}/page.tsx`

    expect(existsSync(route), route).toBe(true)
  }
})

test("each variant links to its own page", async () => {
  const { user } = await renderGallery(<Gallery variant="card" />)

  expect(
    screen.getByRole("link", { name: "Card on its own page" }).getAttribute("href")
  ).toBe("/wave-player/card")

  await user.click(variant("Card + Playlist"))
  expect(
    screen.getByRole("link", { name: "Card + Playlist on its own page" }).getAttribute("href")
  ).toBe("/wave-player/with-playlist")
})

test("the URL picks the variant, and a change writes it back", async () => {
  params.search = "variant=playlist"
  const replace = vi.spyOn(window.history, "replaceState")
  const { user } = await renderGallery(<GalleryFromUrl />)

  expect(variant("Playlist").getAttribute("aria-checked")).toBe("true")
  expect(screen.getByRole("grid", { name: "Playlist" })).toBeTruthy()

  await user.click(variant("Card"))
  expect(String(replace.mock.lastCall?.[2])).toMatch(/\?variant=card$/)
})

test("an unknown variant in the URL falls back to the card", async () => {
  params.search = "variant=nope"
  await renderGallery(<GalleryFromUrl />)

  expect(variant("Card").getAttribute("aria-checked")).toBe("true")
  expect(frames()).toHaveLength(1)
})

test("an agent finds every control by name with the card and Playlist shown", async () => {
  const { player } = await renderGallery(<Gallery variant="with-playlist" />)

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more")
  for (const entry of components) {
    expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  }
  const labels = components.map((entry) => entry.label)
  for (const label of [
    "Variant",
    "Transport",
    "Play",
    "Seek",
    "Shuffle",
    "Repeat",
    "Volume",
    "Open Playlist",
  ]) {
    expect(labels, `${label} is missing from the snapshot`).toContain(label)
  }

  const opened = await agent.act({
    steps: [
      { ref: "Open Playlist", action: "setOpen", args: [true] },
      { ref: "Playlist", action: "select", args: ["Shoal"] },
    ],
  })
  expect(opened.ok, opened.error?.message).toBe(true)
  expect(player.store.getSnapshot().selected).toBe("c")
  expect(player.station.openStrip).not.toHaveBeenCalled()

  const played = await agent.act({
    steps: [
      { ref: "Playlist", action: "play", args: ["Undertow"] },
      { ref: "Playlist", action: "setOpen", args: [false] },
      { ref: "Variant", action: "setValue", args: ["Card"] },
    ],
  })
  expect(played.ok, played.error?.message).toBe(true)
  expect(player.store.getSnapshot().current?.track.title).toBe("Undertow")
  expect(player.station.openStrip).toHaveBeenCalledOnce()
  // The gallery swaps the variant in a transition, which lands after the agent's steps return.
  await waitFor(() => expect(variant("Card").getAttribute("aria-checked")).toBe("true"))
  expect(screen.queryByRole("button", { name: "Open Playlist" })).toBeNull()
})

test("a URL change after mount swaps the variant, its radio, and its link together", async () => {
  params.search = "variant=mini"
  const player = testPlayer(TEST_TRACKS)
  const view = render(
    <WavePlayerStore store={player.store}>
      <GalleryFromUrl />
    </WavePlayerStore>
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(variant("Mini").getAttribute("aria-checked")).toBe("true")

  params.search = "variant=card"
  view.rerender(
    <WavePlayerStore store={player.store}>
      <GalleryFromUrl />
    </WavePlayerStore>
  )

  expect(variant("Card").getAttribute("aria-checked")).toBe("true")
  expect(screen.queryByRole("link", { name: "Open player" })).toBeNull()
  expect(screen.getByRole("link", { name: "Card on its own page" }).getAttribute("href")).toBe(
    "/wave-player/card"
  )
})

test("with the Playlist alone, the player's page keys and Space on a row still work", async () => {
  const player = testPlayer(TEST_TRACKS)
  render(
    <WavePlayerStore store={player.store} keys="page">
      <Gallery variant="playlist" />
    </WavePlayerStore>
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const user = userEvent.setup()

  variant("Playlist").focus()
  await user.keyboard("s")
  expect(player.store.getSnapshot().settings.shuffle).toBe(true)

  const cell = screen.getByRole("grid", { name: "Playlist" }).querySelector<HTMLElement>('[tabindex="0"]')!
  cell.focus()
  await user.keyboard(" ")
  expect(player.station.openStrip).toHaveBeenCalledOnce()
  expect(player.store.getSnapshot().settings.shuffle).toBe(true)
})
