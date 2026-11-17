import { describe, expect, test, vi } from "vitest"

import {
  ok,
  toSeconds,
  type AudioStation,
  type FileHandle,
  type Result,
  type Seconds,
  type SourceError,
  type SourceSpec,
  type SourceStatus,
  type StationSnapshot,
  type Strip,
} from "@/lib/audio/index"

import type { WavePlayerTrack } from "./playlist"
import { createPlayerStore, type PlayerEnv } from "./store"

const TRACKS: readonly WavePlayerTrack[] = [
  { id: "a", title: "Low tide", src: "/a.mp3" },
  { id: "b", title: "Undertow", src: "/b.mp3" },
  { id: "c", title: "Shoal", src: "/c.mp3" },
]

type PlayResult = Result<FileHandle, SourceError>

type FakeHandle = FileHandle & { readonly seeks: Seconds[] }

function fakeHandle(name: string): FakeHandle {
  let position = toSeconds(0)
  const seeks: Seconds[] = []

  return {
    name,
    seeks,
    duration: () => null,
    position: () => position,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    seek(to) {
      seeks.push(to)
      position = to
    },
    setLoop: vi.fn(),
  }
}

type FakeStrip = Strip & {
  readonly plays: { readonly spec: SourceSpec; settle: (result: PlayResult) => void }[]
  emit: (status: SourceStatus) => void
  notify: () => void
  listenerCount: () => number
}

// connectOnPlay false keeps the old status through play(), so a repeated
// notification of it can be heard.
function fakeStrip(log: string[], connectOnPlay = true): FakeStrip {
  let status: SourceStatus = { kind: "none" }
  const listeners = new Set<() => void>()
  const plays: FakeStrip["plays"] = []
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  const emit = (next: SourceStatus) => {
    status = next
    notify()
  }

  const play = (spec: SourceSpec) => {
    log.push("play")

    return new Promise<PlayResult>((settle) => {
      plays.push({ spec, settle })
      if (connectOnPlay) emit({ kind: "connecting", source: "file" })
    })
  }

  return {
    plays,
    emit,
    notify,
    listenerCount: () => listeners.size,
    getStatus: () => status,
    getFeed: () => null,
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    play: play as Strip["play"],
    stop: vi.fn(() => emit({ kind: "none" })),
    setLevel: vi.fn(),
    setMonitor: vi.fn(),
    setNoise: vi.fn(async () => ok(undefined)),
    feed: () => new Promise(() => {}),
    close: vi.fn(),
  }
}

const running: StationSnapshot = { state: "running", sampleRate: 48_000, context: 1 }

function setup({
  tracks = TRACKS,
  connectOnPlay = true,
  support = "supported",
}: {
  tracks?: readonly WavePlayerTrack[]
  connectOnPlay?: boolean
  support?: "supported" | "unsupported"
} = {}) {
  const log: string[] = []
  const strips: FakeStrip[] = []
  const stationListeners = new Set<() => void>()

  const station: AudioStation = {
    getSnapshot: () => running,
    subscribe(listener) {
      stationListeners.add(listener)

      return () => stationListeners.delete(listener)
    },
    start: vi.fn(() => {
      log.push("start")

      return new Promise<StationSnapshot>(() => {})
    }),
    restart: () => new Promise(() => {}),
    currentTime: () => null,
    openStrip: vi.fn(() => {
      const strip = fakeStrip(log, connectOnPlay)
      strips.push(strip)

      return strip
    }),
    inputs: {} as AudioStation["inputs"],
  }

  const env: PlayerEnv = {
    station: () => station,
    support: () => support,
    mediaSession: () => null,
    resolve: (src) => new URL(src, "https://site.test/music/"),
    probeDuration: () => new Promise(() => {}),
    decodePeaks: () => new Promise(() => {}),
    frame: () => () => {},
    setTimer: () => () => {},
    report: vi.fn(),
  }

  const store = createPlayerStore(tracks, env)
  const stationNotify = () => {
    for (const listener of [...stationListeners]) listener()
  }

  return { store, station, strips, log, stationNotify }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function ended(name: string): SourceStatus {
  return { kind: "file", name, duration: toSeconds(200), playback: "ended" }
}

describe("click to play", () => {
  test("send() starts the station and plays the first track before it returns", () => {
    const { store, station, strips, log } = setup()

    store.send({ type: "toggle" })

    expect(log).toEqual(["start", "play"])
    expect(station.openStrip).toHaveBeenCalledOnce()
    expect(strips[0].setLevel).toHaveBeenCalledWith(1)
    expect(strips[0].plays.map((call) => call.spec)).toEqual([
      { kind: "file", file: new URL("https://site.test/a.mp3"), loop: false },
    ])
    expect(store.getSnapshot().status).toEqual({ kind: "loading" })
    expect(store.getSnapshot().active).toBe(true)
  })

  test("a Playlist row plays its own track inside send()", () => {
    const { store, strips } = setup()

    store.send({ type: "play-track", id: "c" })

    expect(strips[0].plays.map((call) => call.spec)).toEqual([
      { kind: "file", file: new URL("https://site.test/c.mp3"), loop: false },
    ])
    expect(store.getSnapshot().current?.track.id).toBe("c")
  })

  test("without Web Audio it fails as unsupported and opens nothing", () => {
    const { store, station } = setup({ support: "unsupported" })

    store.send({ type: "toggle" })

    expect(station.openStrip).not.toHaveBeenCalled()
    expect(store.getSnapshot().status).toEqual({ kind: "failed", reason: "unsupported" })
  })

  test("an empty playlist ignores commands", () => {
    const { store, station } = setup({ tracks: [] })

    store.send({ type: "toggle" })

    expect(station.openStrip).not.toHaveBeenCalled()
    expect(store.getSnapshot().summary).toEqual({ kind: "empty" })
  })
})

describe("loads", () => {
  test("a late result from a replaced load binds nothing", async () => {
    const { store, strips } = setup()
    const first = fakeHandle("a.mp3")
    const second = fakeHandle("b.mp3")

    store.send({ type: "toggle" })
    store.send({ type: "next" })
    strips[0].plays[1].settle(ok(second))
    await tick()
    strips[0].plays[0].settle(ok(first))
    await tick()

    store.send({ type: "seek", to: 30 })

    expect(second.seeks).toEqual([30])
    expect(first.seeks).toEqual([])
    expect(store.playhead.position()).toBe(30)
  })

  test("a seek before the track loads applies when its handle arrives", async () => {
    const { store, strips } = setup()
    const handle = fakeHandle("a.mp3")

    store.send({ type: "toggle" })
    store.send({ type: "seek", to: 12 })
    expect(store.playhead.position()).toBe(12)

    strips[0].plays[0].settle(ok(handle))
    await tick()

    expect(handle.seeks).toEqual([12])
  })
})

describe("the end of a track", () => {
  test("ended plays the next track inside the strip's listener", () => {
    const { store, strips } = setup()

    store.send({ type: "toggle" })
    strips[0].emit(ended("a.mp3"))

    expect(strips[0].plays.map((call) => call.spec)).toEqual([
      { kind: "file", file: new URL("https://site.test/a.mp3"), loop: false },
      { kind: "file", file: new URL("https://site.test/b.mp3"), loop: false },
    ])
    expect(store.getSnapshot().current?.track.id).toBe("b")
  })

  test("ended advances exactly once, however often listeners hear it", () => {
    const { store, strips, stationNotify } = setup({ connectOnPlay: false })

    store.send({ type: "toggle" })
    strips[0].emit(ended("a.mp3"))
    strips[0].notify()
    stationNotify()

    expect(strips[0].plays).toHaveLength(2)
    expect(store.getSnapshot().current?.track.id).toBe("b")
  })

  test("the last track stays current and reads ended", () => {
    const { store, strips } = setup()

    store.send({ type: "play-track", id: "c" })
    strips[0].emit(ended("c.mp3"))

    expect(strips[0].plays).toHaveLength(1)
    expect(store.getSnapshot().current?.track.id).toBe("c")
    expect(store.getSnapshot().status).toEqual({ kind: "ended" })
    expect(store.getSnapshot().active).toBe(false)
  })
})

describe("release", () => {
  test("closes the strip once, stops listening, and the next gesture opens a new one", () => {
    const { store, station, strips } = setup()
    const onChange = vi.fn()
    store.subscribe(onChange)

    store.send({ type: "toggle" })
    store.release()
    store.release()

    expect(strips[0].close).toHaveBeenCalledOnce()
    expect(strips[0].listenerCount()).toBe(0)
    expect(store.getSnapshot().status).toEqual({ kind: "idle" })
    expect(store.getSnapshot().active).toBe(false)

    onChange.mockClear()
    strips[0].emit(ended("a.mp3"))
    expect(onChange).not.toHaveBeenCalled()

    store.send({ type: "toggle" })
    expect(station.openStrip).toHaveBeenCalledTimes(2)
    expect(strips[1].plays).toHaveLength(1)
  })

  test("a load that resolves after release binds nothing", async () => {
    const { store, strips } = setup()
    const stale = fakeHandle("a.mp3")

    store.send({ type: "toggle" })
    store.release()
    strips[0].plays[0].settle(ok(stale))
    await tick()

    store.send({ type: "seek", to: 8 })

    expect(stale.seeks).toEqual([])
    expect(store.playhead.position()).toBe(8)
  })
})
