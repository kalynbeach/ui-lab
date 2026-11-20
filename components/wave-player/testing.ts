// A real store on a fake browser for the views' tests, trimmed from the
// core's store tests. File handles record their seeks.

import { vi } from "vitest"

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

export const TEST_TRACKS: readonly WavePlayerTrack[] = [
  { id: "a", title: "Low tide", src: "/a.mp3", duration: 120, artist: "Kevelle", record: "Samples" },
  { id: "b", title: "Undertow", src: "/b.mp3", duration: 90 },
  { id: "c", title: "Shoal", src: "/c.mp3", duration: 60 },
]

export type FakeHandle = FileHandle & { readonly seeks: Seconds[] }

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

type PlayCall = {
  readonly spec: SourceSpec
  readonly settle: (result: Result<FileHandle, SourceError>) => void
}

type FakeStrip = Strip & {
  readonly plays: PlayCall[]
  readonly emit: (status: SourceStatus) => void
}

function fakeStrip(): FakeStrip {
  let status: SourceStatus = { kind: "none" }
  const listeners = new Set<() => void>()
  const plays: PlayCall[] = []
  const emit = (next: SourceStatus) => {
    status = next
    for (const listener of [...listeners]) listener()
  }

  return {
    plays,
    emit,
    getStatus: () => status,
    getFeed: () => null,
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    play: ((spec: SourceSpec) =>
      new Promise<Result<FileHandle, SourceError>>((settle) => {
        plays.push({ spec, settle })
        emit({ kind: "connecting", source: "file" })
      })) as Strip["play"],
    stop: vi.fn(() => emit({ kind: "none" })),
    setLevel: vi.fn(),
    setMonitor: vi.fn(),
    setNoise: vi.fn(async () => ok(undefined)),
    feed: () => new Promise(() => {}),
    close: vi.fn(),
  }
}

const RUNNING: StationSnapshot = { state: "running", sampleRate: 48_000, context: 1 }

export function testPlayer(
  tracks: readonly WavePlayerTrack[] = TEST_TRACKS,
  { support = "supported" }: { readonly support?: "supported" | "unsupported" } = {}
) {
  const strips: FakeStrip[] = []
  const station: AudioStation = {
    getSnapshot: () => RUNNING,
    subscribe: () => () => {},
    start: vi.fn(() => new Promise<StationSnapshot>(() => {})),
    restart: () => new Promise(() => {}),
    currentTime: () => null,
    openStrip: vi.fn(() => {
      const strip = fakeStrip()
      strips.push(strip)

      return strip
    }),
    inputs: {} as AudioStation["inputs"],
  }

  const env: PlayerEnv = {
    station: () => station,
    support: () => support,
    mediaSession: () => null,
    resolve: (src) => new URL(src, "https://site.test/"),
    probeDuration: () => new Promise<Seconds | null>(() => {}),
    decodePeaks: () => new Promise<null>(() => {}),
    preload: () => new Promise<void>(() => {}),
    frame: () => () => {},
    setTimer: () => () => {},
    onPageHide: () => () => {},
    report: vi.fn(),
    seed: () => 7,
    settings: null,
  }

  const store = createPlayerStore(tracks, env)

  // Settles the newest load and reports it playing, as the strip does, with the length the file reports.
  async function load(name = "a.mp3", duration = 120): Promise<FakeHandle> {
    const handle = fakeHandle(name)
    const strip = strips.at(-1)

    if (!strip) throw new Error("Nothing asked to play yet")

    strip.plays.at(-1)?.settle(ok(handle))
    await new Promise((resolve) => setTimeout(resolve, 0))
    strip.emit({ kind: "file", name, duration: toSeconds(duration), playback: "playing" })

    return handle
  }

  return { store, station, strips, load }
}
