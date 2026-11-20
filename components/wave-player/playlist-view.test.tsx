import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createAgent } from "@ui-sdk/react/agent"
import { describe, expect, test, vi } from "vitest"

import {
  toSeconds,
  type AudioStation,
  type Seconds,
  type SourceStatus,
  type Strip,
} from "@/lib/audio/index"

import { PlayerStoreContext } from "./context"
import type { WavePlayerTrack } from "./playlist"
import { createPlayerStore, type PlayerEnv } from "./store"
import { WavePlayerPlaylist } from "./playlist-view"

const TRACKS: readonly WavePlayerTrack[] = [
  { id: "a", title: "Low tide", src: "/a.mp3", artist: "Kevelle", duration: 84 },
  { id: "b", title: "Undertow", src: "/b.mp3" },
  { id: "c", title: "Afterimage", src: "/c.mp3" },
  { id: "d", title: "Night transit", src: "/d.mp3" },
]

const agent = createAgent()

// Enough of a strip to see which track a press asked for, and to report it playing.
function fakeStrip(plays: string[], emitters: ((status: SourceStatus) => void)[]): Strip {
  let status: SourceStatus = { kind: "none" }
  const listeners = new Set<() => void>()
  emitters.push((next) => {
    status = next
    for (const listener of [...listeners]) listener()
  })
  return {
    getStatus: () => status,
    getFeed: () => null,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    play: ((spec: { file: URL | File }) => {
      plays.push(spec.file instanceof URL ? spec.file.pathname : spec.file.name)
      return new Promise(() => {})
    }) as Strip["play"],
    stop: vi.fn(),
    setLevel: vi.fn(),
    setMonitor: vi.fn(),
    setNoise: vi.fn(),
    feed: () => new Promise(() => {}),
    close: vi.fn(),
  } as unknown as Strip
}

function setup(tracks: readonly WavePlayerTrack[] = TRACKS) {
  const plays: string[] = []
  const emitters: ((status: SourceStatus) => void)[] = []
  const station = {
    getSnapshot: () => ({ state: "running", sampleRate: 48_000, context: 1 }),
    subscribe: () => () => {},
    start: vi.fn(() => new Promise(() => {})),
    restart: () => new Promise(() => {}),
    currentTime: () => null,
    openStrip: vi.fn(() => fakeStrip(plays, emitters)),
    inputs: {},
  } as unknown as AudioStation

  const env: PlayerEnv = {
    station: () => station,
    support: () => "supported",
    mediaSession: () => null,
    resolve: (src) => new URL(src, "https://site.test/"),
    probeDuration: vi.fn(() => new Promise<Seconds | null>(() => {})),
    decodePeaks: vi.fn(() => new Promise<null>(() => {})),
    preload: vi.fn(() => new Promise<void>(() => {})),
    frame: () => () => {},
    setTimer: () => () => {},
    onPageHide: () => () => {},
    report: vi.fn(),
    seed: () => 7,
    settings: null,
  }

  const store = createPlayerStore(tracks, env)
  const user = userEvent.setup()
  const view = render(
    <PlayerStoreContext value={store}>
      <WavePlayerPlaylist heading={<h2>Playlist</h2>} />
    </PlayerStoreContext>
  )
  const grid = () => screen.getByRole("grid", { name: "Playlist" })
  const row = (title: string) =>
    within(grid())
      .getAllByRole("row")
      .find((el) => el.textContent?.includes(title))!
  const cell = (title: string) => within(row(title)).getAllByRole("gridcell")[0]
  const playButton = (title: string) =>
    within(row(title)).getByRole("button", { name: `Play ${title}` })

  const emit = (status: SourceStatus) => act(() => emitters.at(-1)!(status))

  return { store, env, station, plays, emit, user, view, grid, row, cell, playButton }
}

describe("WavePlayerPlaylist", () => {
  test("lists each track's number, title, artist, and duration under the host's heading", () => {
    const { grid, row } = setup()

    expect(screen.getByRole("heading", { level: 2, name: "Playlist" })).toBeTruthy()
    expect(within(grid()).getAllByRole("row")).toHaveLength(4)
    expect(row("Low tide").textContent).toBe("01Low tideKevelle01:24")
    expect(row("Undertow").textContent).toBe("02Undertow--:--")
  })

  test("an empty list shows one plain line", () => {
    setup([])

    expect(screen.queryByRole("grid")).toBeNull()
    expect(screen.getByText("No tracks yet.")).toBeTruthy()
  })

  test("holds the durations need while mounted", () => {
    const { env, view } = setup()

    const probes = vi.mocked(env.probeDuration).mock.calls
    expect(probes.map(([media]) => String(media))).toContain("https://site.test/b.mp3")
    expect(probes.some(([, signal]) => signal.aborted)).toBe(false)

    view.unmount()
    expect(probes.every(([, signal]) => signal.aborted)).toBe(true)
  })

  test("a click and Enter select a row and never play", async () => {
    const { store, station, user, cell } = setup()

    await user.click(cell("Afterimage"))
    expect(store.getSnapshot().selected).toBe("c")

    await user.keyboard("{ArrowDown}{Enter}")
    expect(store.getSnapshot().selected).toBe("d")
    expect(station.openStrip).not.toHaveBeenCalled()
    expect(store.getSnapshot().status.kind).toBe("idle")
  })

  test("a row's Play plays that row's track", async () => {
    const { store, plays, user, playButton } = setup()

    await user.click(playButton("Undertow"))

    expect(plays).toEqual(["/b.mp3"])
    expect(store.getSnapshot().current?.track.id).toBe("b")
  })

  test("Right then Enter on a row plays it from the keyboard", async () => {
    const { plays, user } = setup()

    await user.tab()
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}{Enter}")

    expect(plays).toEqual(["/c.mp3"])
  })

  test("arrows, Home, End, and typing move focus without selecting or playing", async () => {
    const { store, station, user, cell, grid } = setup()
    const tabbable = () =>
      [...grid().querySelectorAll("[tabindex]")].filter(
        (el) => el.getAttribute("tabindex") === "0"
      )

    await user.tab()
    expect(document.activeElement).toBe(cell("Low tide"))
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toBe(cell("Undertow"))
    await user.keyboard("{End}")
    expect(document.activeElement).toBe(cell("Night transit"))
    await user.keyboard("{Home}")
    expect(document.activeElement).toBe(cell("Low tide"))
    await user.keyboard("a")
    expect(document.activeElement).toBe(cell("Afterimage"))
    expect(tabbable()).toEqual([cell("Afterimage")])

    expect(store.getSnapshot().selected).toBeNull()
    expect(station.openStrip).not.toHaveBeenCalled()
  })

  test("selected and current are separate attributes that follow the store", () => {
    const { store, row } = setup()

    act(() => store.send({ type: "set-muted", muted: true }))
    act(() => store.send({ type: "play-track", id: "b" }))
    act(() => store.send({ type: "select-track", id: "c" }))

    expect(row("Undertow").getAttribute("aria-current")).toBe("true")
    expect(row("Undertow").getAttribute("aria-selected")).toBe("false")
    expect(row("Afterimage").getAttribute("aria-selected")).toBe("true")
    expect(row("Afterimage").hasAttribute("aria-current")).toBe(false)

    act(() => store.send({ type: "next" }))
    expect(row("Undertow").hasAttribute("aria-current")).toBe(false)
    expect(row("Afterimage").getAttribute("aria-current")).toBe("true")
    expect(row("Afterimage").getAttribute("aria-selected")).toBe("true")
  })

  test("only the current row shows it plays, and only while it plays", () => {
    const { store, emit, row } = setup()
    const sound = (playback: "playing" | "paused") =>
      emit({ kind: "file", name: "b.mp3", duration: toSeconds(30), playback })

    act(() => store.send({ type: "set-muted", muted: true }))
    act(() => store.send({ type: "play-track", id: "b" }))
    sound("playing")
    expect(store.getSnapshot().status.kind).toBe("playing")
    expect(row("Undertow").hasAttribute("data-playing")).toBe(true)
    expect(row("Low tide").hasAttribute("data-playing")).toBe(false)

    sound("paused")
    expect(row("Undertow").hasAttribute("data-playing")).toBe(false)
    expect(row("Undertow").getAttribute("aria-current")).toBe("true")
  })

  test("a failed current row prints --:-- for its time, and the other rows keep theirs", () => {
    const { store, emit, row } = setup([
      { id: "a", title: "Low tide", src: "/a.mp3", duration: 84 },
      { id: "b", title: "Undertow", src: "/b.mp3", duration: 61 },
    ])

    act(() => store.send({ type: "set-muted", muted: true }))
    act(() => store.send({ type: "play-track", id: "a" }))
    expect(row("Low tide").textContent).toContain("01:24")
    expect(row("Undertow").textContent).toContain("01:01")

    emit({ kind: "failed", source: "file", error: { kind: "unknown", message: "404" } })
    expect(store.getSnapshot().status.kind).toBe("failed")
    expect(row("Low tide").textContent).toContain("--:--")
    expect(row("Low tide").textContent).not.toContain("01:24")
    expect(row("Undertow").textContent).toContain("01:01")
    expect(row("Undertow").textContent).not.toContain("--:--")
  })

  test("an agent finds rows by title, then selects and plays them", async () => {
    const { store, plays } = setup()

    const playlists = agent
      .snapshot()
      .filter((entry) => !entry.offPage && entry.label === "Playlist")
    expect(playlists).toHaveLength(1)
    expect(playlists[0].actions).toEqual(expect.arrayContaining(["select", "play"]))
    expect(playlists[0].items?.map((item) => item.label)).toEqual([
      "Low tide",
      "Undertow",
      "Afterimage",
      "Night transit",
    ])
    expect(
      agent.snapshot().some((entry) => !entry.offPage && entry.label?.startsWith("Play "))
    ).toBe(false)

    const selected = await act(() =>
      agent.act({ steps: [{ ref: "Playlist", action: "select", args: ["Night transit"] }] })
    )
    expect(selected.ok, selected.error?.message).toBe(true)
    expect(store.getSnapshot().selected).toBe("d")
    expect(plays).toEqual([])

    const played = await act(() =>
      agent.act({ steps: [{ ref: "Playlist", action: "play", args: ["Undertow"] }] })
    )
    expect(played.ok, played.error?.message).toBe(true)
    expect(plays).toEqual(["/b.mp3"])
  })

  test("a person's file stays out of agents' reach, and the rest of the Playlist stays in it", async () => {
    const { store, plays } = setup()

    act(() => {
      store.addFiles([new File(["x"], "mine.mp3", { type: "audio/mpeg" })])
    })

    const playlist = agent
      .snapshot()
      .find((entry) => !entry.offPage && entry.label === "Playlist")
    expect(playlist?.items?.map((item) => item.label)).toEqual([
      "Low tide",
      "Undertow",
      "Afterimage",
      "Night transit",
    ])
    expect(await agent.query({ text: "mine" })).toEqual([])

    // act reports ok for a refused call, so the refusal shows as nothing played.
    await act(() =>
      agent.act({ steps: [{ ref: "Playlist", action: "play", args: ["mine"] }] })
    )
    expect(plays).toEqual([])

    const site = await act(() =>
      agent.act({ steps: [{ ref: "Playlist", action: "play", args: ["Afterimage"] }] })
    )
    expect(site.ok, site.error?.message).toBe(true)
    expect(plays).toEqual(["/c.mp3"])
  })
})

describe("WavePlayerPlaylist, after review", () => {
  test("a selected file shows as selected to a person and never in what agents read", async () => {
    const { store, row } = setup()

    act(() => {
      store.addFiles([new File(["x"], "mine.mp3", { type: "audio/mpeg" })])
    })

    expect(store.getSnapshot().selected).toBe("file:0")
    expect(row("mine").getAttribute("aria-selected")).toBe("true")

    const playlist = agent.snapshot().find((entry) => !entry.offPage && entry.label === "Playlist")
    expect(JSON.stringify(playlist)).not.toContain("file:0")
    expect(JSON.stringify(await agent.query({ within: "Playlist", text: "mine" }))).not.toContain("file:0")
  })

  test("removing the focused row moves focus to the row that takes its place", async () => {
    const { store, user, cell } = setup()

    await user.tab()
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toBe(cell("Undertow"))

    act(() => store.setTracks(TRACKS.filter((track) => track.id !== "b")))
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(document.activeElement).toBe(cell("Afterimage"))
  })

  test("removing the row whose Play holds focus moves focus to the next row's Play", async () => {
    const { store, user, playButton } = setup()

    await user.tab()
    await user.keyboard("{ArrowDown}{ArrowRight}")
    expect(document.activeElement).toBe(playButton("Undertow"))

    act(() => store.setTracks(TRACKS.filter((track) => track.id !== "b")))
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(document.activeElement).toBe(playButton("Afterimage"))
  })

  test("removing the last row moves focus to the row before it", async () => {
    const { store, user, cell } = setup()

    await user.tab()
    await user.keyboard("{End}")
    expect(document.activeElement).toBe(cell("Night transit"))

    act(() => store.setTracks(TRACKS.filter((track) => track.id !== "d")))
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(document.activeElement).toBe(cell("Afterimage"))
  })
})
