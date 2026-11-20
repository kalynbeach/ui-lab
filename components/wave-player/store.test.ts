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
import { createPlayerStore, SAVE_DELAY_MS, type PlayerEnv } from "./store"

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
    setLevel: vi.fn((level: number) => {
      log.push(`level ${level}`)
    }),
    setMonitor: vi.fn((on: boolean) => {
      log.push(`monitor ${on ? "on" : "off"}`)
    }),
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
  mediaSession = null,
  stored = null,
}: {
  tracks?: readonly WavePlayerTrack[]
  connectOnPlay?: boolean
  support?: "supported" | "unsupported"
  mediaSession?: MediaSession | null
  stored?: string | null
} = {}) {
  const storage = {
    text: stored,
    read: vi.fn(() => storage.text),
    write: vi.fn((text: string) => {
      storage.text = text
    }),
  }

  const log: string[] = []
  const strips: FakeStrip[] = []
  const stationListeners = new Set<() => void>()
  const timers = new Set<{ callback: () => void; ms: number }>()
  /** Fires every timer that waits `ms`, as if that long had passed. */
  const elapse = (ms: number) => {
    for (const timer of [...timers]) {
      if (timer.ms !== ms) continue

      timers.delete(timer)
      timer.callback()
    }
  }

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
    mediaSession: () => mediaSession,
    resolve: (src) => new URL(src, "https://site.test/music/"),
    probeDuration: vi.fn(() => new Promise<Seconds | null>(() => {})),
    decodePeaks: vi.fn(() => new Promise<null>(() => {})),
    preload: vi.fn(() => new Promise<void>(() => {})),
    frame: () => () => {},
    setTimer(callback, ms) {
      const timer = { callback, ms }
      timers.add(timer)

      return () => timers.delete(timer)
    },
    report: vi.fn(),
    seed: vi.fn(() => 7),
    settings: storage,
  }

  const store = createPlayerStore(tracks, env)
  const stationNotify = () => {
    for (const listener of [...stationListeners]) listener()
  }

  return { store, station, strips, log, stationNotify, env, storage, elapse }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function ended(name: string): SourceStatus {
  return { kind: "file", name, duration: toSeconds(200), playback: "ended" }
}

describe("click to play", () => {
  test("send() starts the station and plays the first track before it returns", () => {
    const { store, station, strips, log } = setup()

    store.send({ type: "toggle" })

    expect(log).toEqual(["level 1", "monitor on", "start", "play"])
    expect(station.openStrip).toHaveBeenCalledOnce()
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

  test("selecting a Playlist row opens nothing and plays nothing", () => {
    const { store, station } = setup()

    store.send({ type: "select-track", id: "c" })

    expect(station.openStrip).not.toHaveBeenCalled()
    expect(store.getSnapshot().selected).toBe("c")
    expect(store.getSnapshot().current?.track.id).toBe("a")
    expect(store.getSnapshot().status).toEqual({ kind: "idle" })
  })

  test("without Web Audio it fails as unsupported and opens nothing", () => {
    const { store, station } = setup({ support: "unsupported" })

    store.send({ type: "toggle" })

    expect(station.openStrip).not.toHaveBeenCalled()
    expect(store.getSnapshot().status).toEqual({ kind: "failed", reason: "unsupported" })
  })

  test("after No Web Audio, Play and the current row do nothing", () => {
    const { store } = setup({ support: "unsupported" })

    store.send({ type: "toggle" })
    const failed = store.getSnapshot()

    store.send({ type: "toggle" })
    store.send({ type: "play" })
    store.send({ type: "play-track", id: "a" })
    expect(store.getSnapshot()).toBe(failed)
  })

  test("an empty playlist ignores transport commands and keeps settings", () => {
    const { store, station } = setup({ tracks: [] })

    store.send({ type: "toggle" })
    store.send({ type: "set-repeat", repeat: "all" })

    expect(station.openStrip).not.toHaveBeenCalled()
    expect(store.getSnapshot().summary).toEqual({ kind: "empty" })
    expect(store.getSnapshot().settings.repeat).toBe("all")
  })

  test("building the store draws no shuffle seed; the first command draws one", () => {
    const { store, env } = setup()

    expect(env.seed).not.toHaveBeenCalled()

    store.send({ type: "set-shuffle", shuffle: true })
    store.send({ type: "set-shuffle", shuffle: false })

    expect(env.seed).toHaveBeenCalledOnce()
  })
})

describe("Media Session", () => {
  function fakeSession() {
    const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>()
    const session = {
      metadata: null,
      playbackState: "none",
      setActionHandler: (action: MediaSessionAction, handler: MediaSessionActionHandler | null) =>
        handlers.set(action, handler),
      setPositionState: () => {},
    } as unknown as MediaSession

    return { session, handlers }
  }

  test("previous returns to the track that played, and next shows only while the queue has one", () => {
    vi.stubGlobal(
      "MediaMetadata",
      class {
        constructor(init: object) {
          Object.assign(this, init)
        }
      }
    )

    const { session, handlers } = fakeSession()
    const { store } = setup({ mediaSession: session })

    store.send({ type: "play-track", id: "c" })
    expect(handlers.get("nexttrack")).toBeNull()

    store.send({ type: "set-repeat", repeat: "all" })
    expect(handlers.get("nexttrack")).toBeTypeOf("function")

    handlers.get("previoustrack")!({ action: "previoustrack" })
    expect(store.getSnapshot().current?.track.id).toBe("a")

    vi.unstubAllGlobals()
  })

  test("the player that played last answers the media keys, and the other writes nothing", () => {
    vi.stubGlobal(
      "MediaMetadata",
      class {
        constructor(init: object) {
          Object.assign(this, init)
        }
      }
    )

    const { session, handlers } = fakeSession()
    const first = setup({ mediaSession: session }).store
    const second = setup({ mediaSession: session }).store
    const title = () => (session.metadata as { title?: string } | null)?.title

    first.send({ type: "play-track", id: "c" })
    expect(title()).toBe(first.getSnapshot().current?.track.title)

    second.send({ type: "play-track", id: "b" })
    expect(title()).toBe(second.getSnapshot().current?.track.title)

    first.send({ type: "set-repeat", repeat: "all" })
    expect(title()).toBe(second.getSnapshot().current?.track.title)

    handlers.get("previoustrack")!({ action: "previoustrack" })
    expect(second.getSnapshot().current?.track.id).toBe("a")
    expect(first.getSnapshot().current?.track.id).toBe("c")

    vi.unstubAllGlobals()
  })
})

describe("output", () => {
  test("a muted player opens its strip with the monitor off, before anything plays", () => {
    const { store, log } = setup()

    store.send({ type: "set-level", level: 0.4 })
    store.send({ type: "set-muted", muted: true })
    store.send({ type: "toggle" })

    expect(log).toEqual(["level 0.4", "monitor off", "start", "play"])
  })

  test("a settings command sets the strip once, and only what changed", () => {
    const { store, strips } = setup()

    store.send({ type: "toggle" })
    vi.mocked(strips[0].setLevel).mockClear()
    vi.mocked(strips[0].setMonitor).mockClear()

    store.send({ type: "set-level", level: 0.3 })
    store.send({ type: "set-level", level: 0.3 })
    store.send({ type: "set-muted", muted: true })

    expect(strips[0].setLevel).toHaveBeenCalledTimes(1)
    expect(strips[0].setLevel).toHaveBeenCalledWith(0.3)
    expect(strips[0].setMonitor).toHaveBeenCalledTimes(1)
    expect(strips[0].setMonitor).toHaveBeenCalledWith(false)

    store.send({ type: "set-level", level: 0.5 })

    expect(strips[0].setMonitor).toHaveBeenLastCalledWith(true)
  })

  test("a strip opened again after release gets the current level and monitor", () => {
    const { store, strips } = setup()

    store.send({ type: "toggle" })
    store.send({ type: "set-level", level: 0.6 })
    store.send({ type: "set-muted", muted: true })
    store.release()
    store.send({ type: "toggle" })

    expect(strips[1].setLevel).toHaveBeenCalledWith(0.6)
    expect(strips[1].setMonitor).toHaveBeenCalledWith(false)
  })

  test("repeat one plays with loop on, and the handle's loop follows repeat", async () => {
    const { store, strips } = setup()
    const handle = fakeHandle("a.mp3")

    store.send({ type: "set-repeat", repeat: "one" })
    store.send({ type: "toggle" })
    expect(strips[0].plays[0].spec).toMatchObject({ loop: true })

    strips[0].plays[0].settle(ok(handle))
    await tick()
    expect(handle.setLoop).toHaveBeenLastCalledWith(true)

    store.send({ type: "set-repeat", repeat: "all" })
    expect(handle.setLoop).toHaveBeenLastCalledWith(false)
    expect(handle.setLoop).toHaveBeenCalledTimes(2)
  })

  test("a new handle gets the loop flag, even when repeat changed while it loaded", async () => {
    const { store, strips } = setup()
    const first = fakeHandle("a.mp3")
    const second = fakeHandle("b.mp3")

    store.send({ type: "toggle" })
    strips[0].plays[0].settle(ok(first))
    await tick()
    store.send({ type: "next" })
    store.send({ type: "set-repeat", repeat: "one" })
    strips[0].plays[1].settle(ok(second))
    await tick()

    expect(strips[0].plays[1].spec).toMatchObject({ loop: false })
    expect(second.setLoop).toHaveBeenLastCalledWith(true)
  })

  test("a handle that loaded looping is set back when repeat left one before it arrived", async () => {
    const { store, strips } = setup()
    const third = fakeHandle("c.mp3")

    store.send({ type: "toggle" })
    strips[0].plays[0].settle(ok(fakeHandle("a.mp3")))
    await tick()
    store.send({ type: "next" })
    store.send({ type: "set-repeat", repeat: "one" })
    store.send({ type: "next" })
    store.send({ type: "set-repeat", repeat: "off" })
    strips[0].plays[2].settle(ok(third))
    await tick()

    expect(strips[0].plays[2].spec).toMatchObject({ loop: true })
    expect(third.setLoop).toHaveBeenLastCalledWith(false)
  })
})

describe("saved settings", () => {
  const SAVED = JSON.stringify({ version: 1, level: 0.3, muted: true, shuffle: true, repeat: "one", time: "remaining" })

  test("restore applies the save through commands, plays nothing, and the next play uses it", () => {
    const { store, station, strips, log } = setup({ stored: SAVED })

    store.restoreSettings()

    expect(store.getSnapshot().settings).toEqual({
      level: 0.3,
      muted: true,
      shuffle: true,
      repeat: "one",
      time: "remaining",
    })
    expect(station.openStrip).not.toHaveBeenCalled()

    store.send({ type: "toggle" })

    expect(log).toEqual(["level 0.3", "monitor off", "start", "play"])
    expect(strips[0].plays[0].spec).toMatchObject({ loop: true })
  })

  test("the defaults never overwrite a save: nothing is written before restore, or by it", () => {
    const { store, storage, elapse } = setup({ stored: SAVED })

    store.retain("durations")
    store.send({ type: "toggle" })
    store.send({ type: "next" })
    expect(storage.write).not.toHaveBeenCalled()

    store.restoreSettings()
    expect(storage.write).not.toHaveBeenCalled()
    expect(storage.text).toBe(SAVED)

    store.send({ type: "set-time", time: "elapsed" })
    elapse(SAVE_DELAY_MS)
    expect(JSON.parse(storage.text!)).toMatchObject({ version: 1, time: "elapsed", level: 0.3 })
  })

  test("a level drag writes once after it settles, with the last value", () => {
    const { store, storage, elapse } = setup({ stored: SAVED })

    store.restoreSettings()

    for (let step = 1; step <= 100; step += 1) store.send({ type: "set-level", level: step / 100 })

    expect(storage.write).not.toHaveBeenCalled()

    elapse(SAVE_DELAY_MS)

    expect(storage.write).toHaveBeenCalledTimes(1)
    expect(JSON.parse(storage.text!)).toMatchObject({ level: 1, muted: false })
  })

  test("release writes a waiting change at once", () => {
    const { store, storage } = setup({ stored: SAVED })

    store.restoreSettings()
    store.send({ type: "set-repeat", repeat: "all" })
    expect(storage.write).not.toHaveBeenCalled()

    store.release()

    expect(JSON.parse(storage.text!)).toMatchObject({ repeat: "all" })
  })

  test("a level raised before restore stays unmuted over a saved mute", () => {
    const { store } = setup({ stored: SAVED })

    store.send({ type: "set-level", level: 0.8 })
    store.restoreSettings()

    expect(store.getSnapshot().settings).toMatchObject({ level: 0.8, muted: false })
  })

  test("a setting set to its default before restore still wins over the save", () => {
    const { store } = setup({ stored: SAVED })

    store.send({ type: "set-muted", muted: false })
    store.restoreSettings()

    expect(store.getSnapshot().settings).toMatchObject({ level: 0.3, muted: false })
  })

  test("a setting changed before restore keeps its value, and the rest come from the save", () => {
    const { store } = setup({ stored: SAVED })

    store.send({ type: "set-repeat", repeat: "all" })
    store.restoreSettings()

    expect(store.getSnapshot().settings).toMatchObject({ repeat: "all", shuffle: true, level: 0.3 })
  })

  test("a mute set before restore survives the saved level, which would unmute", () => {
    const { store } = setup({
      stored: JSON.stringify({ version: 1, level: 0.5, muted: false, shuffle: false, repeat: "off", time: "elapsed" }),
    })

    store.send({ type: "set-muted", muted: true })
    store.restoreSettings()

    expect(store.getSnapshot().settings).toMatchObject({ level: 0.5, muted: true })
  })

  test.each([null, "not json", "{\"version\":9,\"level\":0.1}", "[]"])(
    "stored %s leaves the defaults, and saving starts",
    (stored) => {
      const { store, storage, elapse } = setup({ stored })

      expect(() => store.restoreSettings()).not.toThrow()
      expect(store.getSnapshot().settings.level).toBe(1)

      store.send({ type: "set-level", level: 0.7 })
      elapse(SAVE_DELAY_MS)

      expect(JSON.parse(storage.text!)).toMatchObject({ version: 1, level: 0.7 })
    }
  )

  test("a second restore does nothing", () => {
    const { store, storage } = setup({ stored: SAVED })

    store.restoreSettings()
    store.send({ type: "set-level", level: 0.9 })
    storage.text = SAVED
    store.restoreSettings()

    expect(store.getSnapshot().settings.level).toBe(0.9)
  })
})

describe("a person's files", () => {
  const audio = (name: string) => new File(["x"], name, { type: "audio/mpeg" })

  test("addFiles adds the files after the site's tracks, selects the first, and plays nothing", () => {
    const { store, station } = setup()

    const added = store.addFiles([audio("Tide pool.mp3"), new File(["x"], "notes.txt", { type: "text/plain" })])

    expect(added.issues).toEqual([{ kind: "unsupported-file", name: "notes.txt" }])
    expect(station.openStrip).not.toHaveBeenCalled()
    expect(store.getSnapshot().tracks.map((track) => [track.title, track.source])).toEqual([
      ["Low tide", "site"],
      ["Undertow", "site"],
      ["Shoal", "site"],
      ["Tide pool", "file"],
    ])
    expect(store.getSnapshot().selected).toBe(added.tracks[0].id)
    expect(store.getSnapshot().current?.track.id).toBe("a")
  })

  test("the strip plays the File itself", () => {
    const { store, strips } = setup()
    const file = audio("Tide pool.mp3")
    const [track] = store.addFiles([file]).tracks

    store.send({ type: "play-track", id: track.id })

    expect(strips[0].plays[0].spec).toEqual({ kind: "file", file, loop: false })
  })

  test("an empty player's first file becomes current and idle", () => {
    const { store, station } = setup({ tracks: [] })

    store.addFiles([audio("one.mp3")])

    expect(store.getSnapshot().current?.track.title).toBe("one")
    expect(store.getSnapshot().status).toEqual({ kind: "idle" })
    expect(station.openStrip).not.toHaveBeenCalled()
  })

  test("adding files while a track plays neither stops nor restarts it", () => {
    const { store, strips } = setup()

    store.send({ type: "toggle" })
    store.addFiles([audio("one.mp3")])

    expect(strips[0].plays).toHaveLength(1)
    expect(strips[0].stop).not.toHaveBeenCalled()
    expect(store.getSnapshot().current?.track.id).toBe("a")
  })

  test("a new site list keeps the files, and ids are never reused", () => {
    const { store } = setup()

    const first = store.addFiles([audio("one.mp3")]).tracks[0].id
    store.setTracks(TRACKS.slice(0, 1))
    expect(store.getSnapshot().tracks.map((track) => track.title)).toEqual(["Low tide", "one"])
    const second = store.addFiles([audio("two.mp3")]).tracks[0].id

    expect(second).not.toBe(first)
    expect(store.getSnapshot().tracks.map((track) => track.title)).toEqual(["Low tide", "one", "two"])
  })

  test("a file's duration probe reads the File, not a URL", () => {
    const { store, env } = setup({ tracks: [] })
    const file = audio("one.mp3")

    store.addFiles([file])
    store.retain("current")

    expect(vi.mocked(env.probeDuration).mock.calls.map(([media]) => media)).toEqual([file])
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

describe("scrub", () => {
  async function playing() {
    const context = setup()
    const handle = fakeHandle("a.mp3")

    context.store.send({ type: "toggle" })
    context.strips[0].plays[0].settle(ok(handle))
    await tick()

    return { ...context, handle }
  }

  test("a preview shows its target on the playhead and seeks nothing until commit, which seeks once", async () => {
    const { store, handle } = await playing()
    const heard = vi.fn()
    store.playhead.subscribe(heard)

    store.playhead.preview(40)
    store.playhead.preview(55)

    expect(store.playhead.position()).toBe(55)
    expect(heard).toHaveBeenCalledTimes(2)
    expect(handle.seeks).toEqual([])

    store.playhead.commit()
    store.playhead.commit()

    expect(handle.seeks).toEqual([55])
    expect(store.playhead.position()).toBe(55)
  })

  test("cancel drops the preview without seeking", async () => {
    const { store, handle } = await playing()

    store.playhead.preview(40)
    store.playhead.cancel()
    store.playhead.commit()

    expect(handle.seeks).toEqual([])
    expect(store.playhead.position()).toBe(0)
  })

  test("a track change drops the scrub, so its commit never seeks the new track", async () => {
    const { store, strips, handle } = await playing()
    const next = fakeHandle("b.mp3")

    store.playhead.preview(90)
    store.send({ type: "next" })

    expect(store.playhead.position()).toBe(0)

    strips[0].plays[1].settle(ok(next))
    await tick()
    store.playhead.commit()

    expect(next.seeks).toEqual([])
    expect(handle.seeks).toEqual([])
  })

  test("the end of the track drops the scrub", async () => {
    const { store, strips, handle } = await playing()

    store.playhead.preview(90)
    strips[0].emit(ended("a.mp3"))
    store.playhead.commit()

    expect(store.getSnapshot().current?.track.id).toBe("b")
    expect(handle.seeks).toEqual([])
  })

  test("a pause keeps the scrub; a cancelled load and a release drop it", async () => {
    const { store, strips, handle } = await playing()

    strips[0].emit({ kind: "file", name: "a.mp3", duration: toSeconds(200), playback: "playing" })
    store.playhead.preview(30)
    store.send({ type: "pause" })
    store.playhead.commit()

    expect(handle.seeks).toEqual([30])

    store.send({ type: "play-track", id: "b" })
    store.playhead.preview(45)
    store.send({ type: "pause" })
    store.playhead.commit()

    store.playhead.preview(50)
    store.release()
    expect(store.playhead.position()).toBe(0)
    store.playhead.commit()

    expect(handle.seeks).toEqual([30])
    expect(store.playhead.position()).toBe(0)
  })

  test("Media Session keeps the playing position while a scrub previews", async () => {
    vi.stubGlobal("MediaMetadata", class {})

    const positions: (MediaPositionState | undefined)[] = []
    const session = {
      metadata: null,
      playbackState: "none",
      setActionHandler: () => {},
      setPositionState: (state?: MediaPositionState) => positions.push(state),
    } as unknown as MediaSession
    const { store, strips } = setup({ mediaSession: session })
    const handle = fakeHandle("a.mp3")

    store.send({ type: "toggle" })
    strips[0].plays[0].settle(ok(handle))
    await tick()
    handle.seek(toSeconds(12))
    strips[0].emit({ kind: "file", name: "a.mp3", duration: toSeconds(200), playback: "playing" })
    store.playhead.preview(90)
    store.send({ type: "set-level", level: 0.5 })

    expect(store.playhead.position()).toBe(90)
    expect(positions.at(-1)).toMatchObject({ position: 12, duration: 200 })

    vi.unstubAllGlobals()
  })

  test("nothing previews after a failure", () => {
    const { store, strips } = setup()

    store.send({ type: "toggle" })
    strips[0].emit({ kind: "failed", source: "file", error: { kind: "unknown", message: "404" } })
    store.playhead.preview(20)

    expect(store.playhead.position()).toBe(0)
  })
})

describe("peaks and preload", () => {
  const playing: SourceStatus = { kind: "file", name: "a.mp3", duration: toSeconds(200), playback: "playing" }

  test("a seek bar's need decodes the current track's peaks before anything plays", () => {
    const { store, env, station } = setup()

    store.retain("peaks")

    expect(vi.mocked(env.decodePeaks).mock.calls.map(([media]) => media)).toEqual([
      new URL("https://site.test/a.mp3"),
    ])
    expect(station.openStrip).not.toHaveBeenCalled()
  })

  test("while a track plays, the track Next plays is preloaded once", async () => {
    const { store, strips, env } = setup()
    let done = () => {}
    vi.mocked(env.preload).mockImplementation(() => new Promise<void>((resolve) => (done = resolve)))

    store.send({ type: "toggle" })
    expect(env.preload).not.toHaveBeenCalled()

    strips[0].emit(playing)
    expect(vi.mocked(env.preload).mock.calls.map(([url]) => url)).toEqual([new URL("https://site.test/b.mp3")])

    done()
    await tick()
    strips[0].notify()
    store.send({ type: "set-level", level: 0.5 })

    expect(env.preload).toHaveBeenCalledOnce()
  })

  test("a change of the next track aborts the preload and warms the new one", () => {
    const { store, strips, env } = setup()

    store.send({ type: "toggle" })
    strips[0].emit(playing)
    store.send({ type: "set-repeat", repeat: "all" })
    store.send({ type: "play-track", id: "c" })
    strips[0].emit({ ...playing, name: "c.mp3" })

    const [[, first], [second]] = vi.mocked(env.preload).mock.calls

    expect(first.aborted).toBe(true)
    expect(second).toEqual(new URL("https://site.test/a.mp3"))
  })

  test("repeat one preloads nothing", () => {
    const { store, strips, env } = setup()

    store.send({ type: "set-repeat", repeat: "one" })
    store.send({ type: "toggle" })
    strips[0].emit(playing)

    expect(env.preload).not.toHaveBeenCalled()
  })

  test("a person's file is never preloaded", () => {
    const { store, strips, env } = setup({ tracks: TRACKS.slice(0, 1) })

    store.addFiles([new File(["x"], "two.mp3", { type: "audio/mpeg" })])
    store.send({ type: "toggle" })
    strips[0].emit(playing)

    expect(store.getSnapshot().canNext).toBe(true)
    expect(env.preload).not.toHaveBeenCalled()
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

test("a file added after a direct play skipped a track plays after the retrace, and the skipped track stays skipped", () => {
  const { store } = setup()

  store.send({ type: "play-track", id: "c" })
  store.send({ type: "previous" })

  const [file] = store.addFiles([new File(["x"], "Tide pool.mp3", { type: "audio/mpeg" })]).tracks
  const visited: string[] = []

  while (store.getSnapshot().canNext && visited.length < 5) {
    store.send({ type: "next" })
    visited.push(store.getSnapshot().current!.track.id)
  }

  expect(visited).toEqual(["c", file.id])
})
