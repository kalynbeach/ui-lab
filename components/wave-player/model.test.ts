import { describe, expect, test } from "vitest"

import { toSeconds, type SourceStatus, type StationSnapshot } from "@/lib/audio/index"

import {
  deriveState,
  deriveStatus,
  hasNext,
  planCommand,
  planEnded,
  startsAudio,
  wantedLoads,
  type Effect,
  type PlayerCommand,
  type Situation,
  type StatusKind,
  type StoreInputs,
} from "./model"
import { toPeaks } from "./peaks"
import { parsePlaylist, type WavePlayerTrack } from "./playlist"

const STATUSES: readonly StatusKind[] = [
  "idle",
  "loading",
  "playing",
  "paused",
  "blocked",
  "ended",
  "failed",
]

const TRACKS: readonly WavePlayerTrack[] = [
  { id: "a", title: "Low tide", src: "/a.mp3" },
  { id: "b", title: "Undertow", src: "/b.mp3" },
  { id: "c", title: "Shoal", src: "/c.mp3" },
]

const indexOf = new Map(TRACKS.map((track, index) => [track.id, index]))

function at(overrides: Partial<Situation> = {}): Situation {
  return {
    index: 1,
    count: 3,
    status: "paused",
    position: 0,
    duration: toSeconds(200),
    loaded: true,
    retry: true,
    indexOf,
    ...overrides,
  }
}

const none: Effect = { kind: "none" }
const load: Effect = { kind: "load" }
const resume: Effect = { kind: "resume" }
const restart: Effect = { kind: "restart" }
const pause: Effect = { kind: "pause" }
const cancel: Effect = { kind: "cancel" }

describe("planCommand after a failure retrying can't fix", () => {
  const stuck = at({ status: "failed", retry: false })

  test.each<PlayerCommand>([
    { type: "toggle" },
    { type: "play" },
    { type: "play-track", id: "b" },
  ])("$type does nothing", (command) => {
    expect(planCommand(command, stuck)).toEqual({ index: 1, effect: { kind: "none" } })
  })

  test("another row still loads its track", () => {
    expect(planCommand({ type: "play-track", id: "c" }, stuck).index).toBe(2)
  })
})

describe("planCommand keeps the track and picks an effect by status", () => {
  const rows: Record<
    "toggle" | "play" | "pause" | "current row",
    Record<StatusKind, Effect>
  > = {
    toggle: {
      idle: load,
      loading: cancel,
      playing: pause,
      paused: resume,
      blocked: resume,
      ended: resume,
      failed: load,
    },
    play: {
      idle: load,
      loading: none,
      playing: none,
      paused: resume,
      blocked: resume,
      ended: resume,
      failed: load,
    },
    pause: {
      idle: none,
      loading: cancel,
      playing: pause,
      paused: none,
      blocked: none,
      ended: none,
      failed: none,
    },
    "current row": {
      idle: load,
      loading: none,
      playing: none,
      paused: resume,
      blocked: resume,
      ended: restart,
      failed: load,
    },
  }

  const commands: Record<keyof typeof rows, PlayerCommand> = {
    toggle: { type: "toggle" },
    play: { type: "play" },
    pause: { type: "pause" },
    "current row": { type: "play-track", id: "b" },
  }

  for (const [name, row] of Object.entries(rows) as [
    keyof typeof rows,
    Record<StatusKind, Effect>,
  ][])
    test.each(STATUSES)(`${name} while %s`, (status) => {
      expect(planCommand(commands[name], at({ status }))).toEqual({
        index: 1,
        effect: row[status],
      })
    })
})

describe("next", () => {
  test.each(STATUSES)("loads the following track while %s", (status) => {
    expect(planCommand({ type: "next" }, at({ status }))).toEqual({
      index: 2,
      effect: load,
    })
  })

  test.each(STATUSES)("does nothing on the last track while %s", (status) => {
    expect(planCommand({ type: "next" }, at({ status, index: 2 }))).toEqual({
      index: 2,
      effect: none,
    })
  })
})

describe("previous", () => {
  test.each(STATUSES)(
    "restarts a loaded track more than 3 s in while %s",
    (status) => {
      expect(
        planCommand({ type: "previous" }, at({ status, position: 3.01 }))
      ).toEqual({ index: 1, effect: restart })
    }
  )

  test("goes back a track at exactly 3 s", () => {
    expect(planCommand({ type: "previous" }, at({ position: 3 }))).toEqual({
      index: 0,
      effect: load,
    })
  })

  test("goes back a track when the current one has not loaded, whatever the position", () => {
    expect(
      planCommand({ type: "previous" }, at({ position: 50, loaded: false }))
    ).toEqual({ index: 0, effect: load })
  })

  test("restarts the first track when it has loaded", () => {
    expect(
      planCommand({ type: "previous" }, at({ index: 0, position: 1 }))
    ).toEqual({ index: 0, effect: restart })
  })

  test("loads the first track when it has not loaded", () => {
    expect(
      planCommand({ type: "previous" }, at({ index: 0, loaded: false }))
    ).toEqual({ index: 0, effect: load })
  })
})

describe("play-track", () => {
  test.each(STATUSES)("loads another track while %s", (status) => {
    expect(
      planCommand({ type: "play-track", id: "c" }, at({ status }))
    ).toEqual({ index: 2, effect: load })
  })

  test("does nothing for an unknown id", () => {
    expect(
      planCommand({ type: "play-track", id: "zz" }, at({ status: "idle" }))
    ).toEqual({ index: 1, effect: none })
  })
})

describe("seek", () => {
  const seekable = STATUSES.filter((status) => status !== "failed")

  test.each(seekable)("seeks to the position while %s", (status) => {
    expect(planCommand({ type: "seek", to: 42.5 }, at({ status }))).toEqual({
      index: 1,
      effect: { kind: "seek", to: 42.5 },
    })
  })

  test("does nothing after a failure", () => {
    expect(
      planCommand({ type: "seek", to: 42 }, at({ status: "failed" }))
    ).toEqual({ index: 1, effect: none })
  })

  test.each([
    [-5, 0],
    [500, 200],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])("clamps %d into the track as %d", (to, expected) => {
    expect(planCommand({ type: "seek", to }, at())).toEqual({
      index: 1,
      effect: { kind: "seek", to: expected },
    })
  })

  test("has no upper bound while the duration is unknown", () => {
    expect(
      planCommand({ type: "seek", to: 9000 }, at({ duration: null }))
    ).toEqual({ index: 1, effect: { kind: "seek", to: 9000 } })
  })
})

describe("planEnded", () => {
  test("advances to the next track, playing", () => {
    expect(planEnded({ index: 0, count: 3 })).toEqual({ index: 1, effect: load })
  })

  test("stays on the last track", () => {
    expect(planEnded({ index: 2, count: 3 })).toEqual({ index: 2, effect: none })
  })
})

test("only load, resume, and restart start audio", () => {
  const effects: readonly Effect[] = [
    none,
    load,
    resume,
    restart,
    pause,
    cancel,
    { kind: "seek", to: toSeconds(1) },
  ]

  expect(effects.filter(startsAudio)).toEqual([load, resume, restart])
})

const running: StationSnapshot = { state: "running", sampleRate: 48_000, context: 1 }

function file(
  playback: "playing" | "paused" | "ended" | "blocked",
  duration: number | null = 200
): SourceStatus {
  return {
    kind: "file",
    name: "a.mp3",
    duration: duration === null ? null : toSeconds(duration),
    playback,
  }
}

describe("deriveStatus", () => {
  const base = {
    source: { kind: "none" } as SourceStatus,
    station: running as StationSnapshot | null,
    unsupported: false,
    awaitingPlay: false,
  }

  test.each<[string, Partial<typeof base>, unknown]>([
    ["nothing loaded", {}, { kind: "idle" }],
    ["no station yet", { station: null }, { kind: "idle" }],
    ["connecting", { source: { kind: "connecting", source: "file" } }, { kind: "loading" }],
    ["playing", { source: file("playing") }, { kind: "playing" }],
    ["paused", { source: file("paused") }, { kind: "paused" }],
    ["paused before the first playing event", { source: file("paused"), awaitingPlay: true }, { kind: "loading" }],
    ["blocked", { source: file("blocked") }, { kind: "blocked" }],
    ["ended", { source: file("ended") }, { kind: "ended" }],
    [
      "playing under a context the system holds",
      { source: file("playing"), station: { state: "suspended", by: "system" } },
      { kind: "blocked" },
    ],
    [
      "playing under a context the station idled",
      { source: file("playing"), station: { state: "suspended", by: "station" } },
      { kind: "playing" },
    ],
    [
      "a track that did not load",
      { source: { kind: "failed", source: "file", error: { kind: "unknown", message: "404" } } },
      { kind: "failed", reason: "load" },
    ],
    [
      "a strip without a running station",
      { source: { kind: "failed", source: "file", error: { kind: "station-not-running" } } },
      { kind: "failed", reason: "audio" },
    ],
    [
      "a failed station",
      { source: file("playing"), station: { state: "failed", error: { kind: "closed" } } },
      { kind: "failed", reason: "audio" },
    ],
    ["no Web Audio", { unsupported: true }, { kind: "failed", reason: "unsupported" }],
    [
      "no Web Audio over a failed track",
      { unsupported: true, source: { kind: "failed", source: "file", error: { kind: "superseded" } } },
      { kind: "failed", reason: "unsupported" },
    ],
    [
      "a failed track over a failed station",
      {
        source: { kind: "failed", source: "file", error: { kind: "superseded" } },
        station: { state: "failed", error: { kind: "closed" } },
      },
      { kind: "failed", reason: "load" },
    ],
  ])("%s", (_, overrides, expected) => {
    expect(deriveStatus({ ...base, ...overrides })).toEqual(expected)
  })

  test("returns one shared object per status", () => {
    expect(deriveStatus({ ...base, source: file("playing") })).toBe(
      deriveStatus({ ...base, source: file("playing", 90) })
    )
  })
})

function inputs(overrides: Partial<StoreInputs> = {}): StoreInputs {
  return {
    playlist: parsePlaylist(TRACKS).playlist,
    index: 0,
    source: { kind: "none" },
    station: null,
    feed: null,
    unsupported: false,
    awaitingPlay: false,
    heard: new Map(),
    probed: new Map(),
    decoded: new Map(),
    ...overrides,
  }
}

describe("deriveState", () => {
  test("an empty playlist has no current track and reads empty", () => {
    const state = deriveState(
      inputs({ playlist: parsePlaylist([]).playlist, index: null }),
      null
    )

    expect(state.current).toBeNull()
    expect(state.summary).toEqual({ kind: "empty" })
    expect(state.active).toBe(false)
  })

  test("the summary carries the status and the current track", () => {
    const state = deriveState(
      inputs({ index: 1, source: file("playing"), station: running }),
      null
    )

    expect(state.summary).toEqual({
      kind: "playing",
      track: { id: "b", title: "Undertow", artist: null, record: null, index: 1, count: 3 },
    })
    expect(state.active).toBe(true)
  })

  test("the last track ending turns playback inactive", () => {
    const state = deriveState(
      inputs({ index: 2, source: file("ended"), station: running }),
      null
    )

    expect(state.status).toEqual({ kind: "ended" })
    expect(state.active).toBe(false)
  })

  test("a duration comes from the site, then the playing element, then one heard, then a probe", () => {
    const tracks: WavePlayerTrack[] = [
      { id: "a", title: "A", src: "/a.mp3", duration: 10 },
      { id: "b", title: "B", src: "/b.mp3" },
      { id: "c", title: "C", src: "/c.mp3" },
      { id: "d", title: "D", src: "/d.mp3" },
    ]
    const state = deriveState(
      inputs({
        playlist: parsePlaylist(tracks).playlist,
        index: 1,
        source: file("playing", 20),
        heard: new Map([
          ["a", toSeconds(99)],
          ["b", toSeconds(98)],
          ["c", toSeconds(30)],
        ]),
        probed: new Map([
          ["c", toSeconds(97)],
          ["d", toSeconds(40)],
        ]),
      }),
      null
    )

    expect(state.tracks.map((track) => track.duration)).toEqual([10, 20, 30, 40])
  })

  test("peaks come from the site before a decode", () => {
    const tracks: WavePlayerTrack[] = [
      { id: "a", title: "A", src: "/a.mp3", peaks: [0.5] },
      { id: "b", title: "B", src: "/b.mp3" },
    ]
    const decoded = new Map([
      ["a", toPeaks([0.9])!],
      ["b", toPeaks([0.1])!],
    ])
    const playlist = parsePlaylist(tracks).playlist

    expect(deriveState(inputs({ playlist, decoded }), null).current?.peaks).toEqual([0.5])
    expect(deriveState(inputs({ playlist, decoded, index: 1 }), null).current?.peaks).toEqual([0.1])
  })

  test("returns the previous snapshot while nothing it shows changes", () => {
    const first = deriveState(inputs({ station: running }), null)
    const again = deriveState(
      inputs({ station: running, playlist: parsePlaylist(TRACKS.map((track) => ({ ...track }))).playlist }),
      first
    )

    expect(again).toBe(first)
  })

  test("a status change makes a new snapshot that keeps unchanged rows and the look", () => {
    const first = deriveState(inputs({ station: running, source: file("paused") }), null)
    const next = deriveState(inputs({ station: running, source: file("playing") }), first)

    expect(next).not.toBe(first)
    expect(next.status).toEqual({ kind: "playing" })
    expect(next.tracks).toBe(first.tracks)
    expect(next.current).toBe(first.current)
    expect(next.look).toBe(first.look)
  })

  test("one row's change replaces that row and keeps the others", () => {
    const first = deriveState(inputs(), null)
    const next = deriveState(inputs({ probed: new Map([["c", toSeconds(12)]]) }), first)

    expect(next).not.toBe(first)
    expect(next.tracks).not.toBe(first.tracks)
    expect(next.tracks[0]).toBe(first.tracks[0])
    expect(next.tracks[1]).toBe(first.tracks[1])
    expect(next.tracks[2].duration).toBe(12)
    expect(next.current).toBe(first.current)
  })

  test("hasNext is false on the last track", () => {
    expect(hasNext(deriveState(inputs({ index: 1 }), null))).toBe(true)
    expect(hasNext(deriveState(inputs({ index: 2 }), null))).toBe(false)
  })
})

describe("wantedLoads", () => {
  const all = { durations: true, current: true, peaks: true }

  test("probes the idle current track first, then the Library's other tracks", () => {
    const state = deriveState(inputs({ index: 1 }), null)

    expect(wantedLoads(state, all, new Set())).toEqual([
      { kind: "duration", id: "b" },
      { kind: "duration", id: "a" },
      { kind: "duration", id: "c" },
    ])
  })

  test("asks for peaks only once playback has run, and skips loads that failed", () => {
    const idle = deriveState(inputs({ station: running }), null)
    const playing = deriveState(inputs({ station: running, source: file("playing") }), null)

    expect(wantedLoads(idle, { durations: false, current: false, peaks: true }, new Set())).toEqual([])
    expect(wantedLoads(playing, all, new Set(["duration:b"]))).toEqual([
      { kind: "duration", id: "c" },
      { kind: "peaks", id: "a" },
    ])
  })

  test("runs nothing nobody needs", () => {
    const state = deriveState(inputs({ source: file("playing") }), null)

    expect(wantedLoads(state, { durations: false, current: false, peaks: false }, new Set())).toEqual([])
  })
})
