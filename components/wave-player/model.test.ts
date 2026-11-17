import { describe, expect, test } from "vitest"

import { toSeconds, type SourceStatus, type StationSnapshot } from "@/lib/audio/index"

import {
  deriveState,
  deriveStatus,
  initialIntent,
  planCommand,
  planEnded,
  reconcilePlaylist,
  reseedIntent,
  startsAudio,
  wantedLoads,
  type Effect,
  type Intent,
  type PlayerCommand,
  type Situation,
  type StatusKind,
  type StoreInputs,
} from "./model"
import { toPeaks } from "./peaks"
import {
  joinPlaylist,
  parseFiles,
  parsePlaylist,
  type Playlist,
  type TrackId,
  type WavePlayerTrack,
} from "./playlist"
import { currentOf } from "./queue"
import type { Repeat } from "./settings"

const STATUSES: readonly StatusKind[] = [
  "idle",
  "loading",
  "playing",
  "paused",
  "blocked",
  "ended",
  "failed",
]

const MODES: readonly { readonly repeat: Repeat; readonly shuffle: boolean }[] = [
  { repeat: "off", shuffle: false },
  { repeat: "all", shuffle: false },
  { repeat: "one", shuffle: false },
  { repeat: "off", shuffle: true },
  { repeat: "all", shuffle: true },
  { repeat: "one", shuffle: true },
]

const TRACKS: readonly WavePlayerTrack[] = [
  { id: "a", title: "Low tide", src: "/a.mp3" },
  { id: "b", title: "Undertow", src: "/b.mp3" },
  { id: "c", title: "Shoal", src: "/c.mp3" },
]

const playlist = parsePlaylist(TRACKS).playlist

function at(intent: Intent, overrides: Partial<Situation> = {}): Situation {
  return {
    playlist,
    intent,
    status: "paused",
    position: 0,
    duration: toSeconds(200),
    loaded: true,
    retry: true,
    ...overrides,
  }
}

/** The intent after `commands`, each planned from an idle, unloaded track. */
function after(commands: readonly PlayerCommand[], list: Playlist = playlist): Intent {
  return commands.reduce(
    (intent, command) =>
      planCommand(command, { ...at(intent, { status: "idle", loaded: false }), playlist: list }).intent,
    reseedIntent(initialIntent(list), 7)
  )
}

/** Current is `id`, reached by playing it from the first track, under `mode`. */
function on(id: string, mode: (typeof MODES)[number] = MODES[0]): Intent {
  return after([
    { type: "set-repeat", repeat: mode.repeat },
    { type: "set-shuffle", shuffle: mode.shuffle },
    { type: "play-track", id },
  ])
}

function outcome(plan: { intent: Intent; effect: Effect }) {
  return { current: currentOf(plan.intent.queue), effect: plan.effect }
}

const none: Effect = { kind: "none" }
const load: Effect = { kind: "load" }
const resume: Effect = { kind: "resume" }
const restart: Effect = { kind: "restart" }
const pause: Effect = { kind: "pause" }
const cancel: Effect = { kind: "cancel" }

describe("planCommand after a failure retrying can't fix", () => {
  const stuck = at(on("b"), { status: "failed", retry: false })

  test.each<PlayerCommand>([
    { type: "toggle" },
    { type: "play" },
    { type: "play-track", id: "b" },
  ])("$type does nothing", (command) => {
    expect(planCommand(command, stuck)).toEqual({ intent: stuck.intent, effect: none })
  })

  test("another row still loads its track", () => {
    expect(outcome(planCommand({ type: "play-track", id: "c" }, stuck))).toEqual({
      current: "c",
      effect: load,
    })
  })
})

describe("planCommand keeps the track and picks an effect by status, under every repeat and shuffle", () => {
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

  for (const mode of MODES)
    for (const [name, row] of Object.entries(rows) as [
      keyof typeof rows,
      Record<StatusKind, Effect>,
    ][])
      test.each(STATUSES)(
        `${name} while %s, repeat ${mode.repeat}, shuffle ${mode.shuffle}`,
        (status) => {
          const intent = on("b", mode)
          const plan = planCommand(commands[name], at(intent, { status }))

          expect(plan.intent).toBe(intent)
          expect(plan.effect).toEqual(row[status])
        }
      )
})

describe("next, unshuffled", () => {
  for (const repeat of ["off", "all", "one"] as const)
    test.each(STATUSES)(`loads the following track while %s, repeat ${repeat}`, (status) => {
      const intent = on("b", { repeat, shuffle: false })

      expect(outcome(planCommand({ type: "next" }, at(intent, { status })))).toEqual({
        current: "c",
        effect: load,
      })
    })

  test.each<[Repeat, string, Effect]>([
    ["off", "c", none],
    ["all", "a", load],
    ["one", "c", none],
  ])("on the last track, repeat %s leaves %s current with %o", (repeat, current, effect) => {
    for (const status of STATUSES)
      expect(
        outcome(planCommand({ type: "next" }, at(on("c", { repeat, shuffle: false }), { status })))
      ).toEqual({ current, effect })
  })
})

describe("every remaining command in every status, under every repeat and shuffle", () => {
  for (const mode of MODES) {
    const name = `repeat ${mode.repeat}, shuffle ${mode.shuffle}`

    test.each(STATUSES)(`next from the middle loads another track while %s, ${name}`, (status) => {
      const plan = planCommand({ type: "next" }, at(on("b", mode), { status }))

      expect(plan.effect).toEqual(load)
      expect(mode.shuffle ? ["a", "c"] : ["c"]).toContain(currentOf(plan.intent.queue))
    })

    test.each(STATUSES)(`previous within 3 s goes back to what played while %s, ${name}`, (status) => {
      expect(outcome(planCommand({ type: "previous" }, at(on("b", mode), { status, position: 1 })))).toEqual({
        current: "a",
        effect: load,
      })
    })

    test.each(STATUSES)(`seek keeps the track while %s, ${name}`, (status) => {
      const intent = on("b", mode)
      const plan = planCommand({ type: "seek", to: 42 }, at(intent, { status }))

      expect(plan.intent).toBe(intent)
      expect(plan.effect).toEqual(status === "failed" ? none : { kind: "seek", to: 42 })
    })

    test.each(STATUSES)(`settings change and play nothing while %s, ${name}`, (status) => {
      const intent = on("b", mode)
      const commands: readonly PlayerCommand[] = [
        { type: "set-level", level: 0.2 },
        { type: "set-muted", muted: true },
        { type: "set-repeat", repeat: mode.repeat === "one" ? "off" : "one" },
        { type: "set-time", time: "remaining" },
        { type: "set-shuffle", shuffle: !mode.shuffle },
      ]

      for (const command of commands) {
        const plan = planCommand(command, at(intent, { status }))

        expect(plan.effect).toEqual(none)
        expect(plan.intent.settings).not.toBe(intent.settings)
        expect(currentOf(plan.intent.queue)).toBe("b")
      }
    })
  }
})

describe("previous", () => {
  for (const mode of MODES)
    test.each(STATUSES)(
      `restarts a loaded track more than 3 s in while %s, repeat ${mode.repeat}, shuffle ${mode.shuffle}`,
      (status) => {
        const intent = on("b", mode)
        const plan = planCommand({ type: "previous" }, at(intent, { status, position: 3.01 }))

        expect(plan.intent).toBe(intent)
        expect(plan.effect).toEqual(restart)
      }
    )

  test("goes back to the track played before at exactly 3 s", () => {
    expect(outcome(planCommand({ type: "previous" }, at(on("b"), { position: 3 })))).toEqual({
      current: "a",
      effect: load,
    })
  })

  test("goes back when the current track has not loaded, whatever the position", () => {
    expect(
      outcome(planCommand({ type: "previous" }, at(on("b"), { position: 50, loaded: false })))
    ).toEqual({ current: "a", effect: load })
  })

  test("goes back to what played, not to the Playlist's previous row", () => {
    expect(outcome(planCommand({ type: "previous" }, at(on("c"))))).toEqual({
      current: "a",
      effect: load,
    })
  })

  test("restarts the track when nothing played before it and it has loaded", () => {
    expect(outcome(planCommand({ type: "previous" }, at(after([]), { position: 1 })))).toEqual({
      current: "a",
      effect: restart,
    })
  })

  test("loads the track when nothing played before it and it has not loaded", () => {
    expect(outcome(planCommand({ type: "previous" }, at(after([]), { loaded: false })))).toEqual({
      current: "a",
      effect: load,
    })
  })
})

describe("play-track", () => {
  for (const mode of MODES)
    test.each(STATUSES)(
      `loads another track while %s, repeat ${mode.repeat}, shuffle ${mode.shuffle}`,
      (status) => {
        expect(
          outcome(planCommand({ type: "play-track", id: "c" }, at(on("b", mode), { status })))
        ).toEqual({ current: "c", effect: load })
      }
    )

  test("does nothing for an unknown id", () => {
    const intent = on("b")

    expect(planCommand({ type: "play-track", id: "zz" }, at(intent, { status: "idle" }))).toEqual({
      intent,
      effect: none,
    })
  })
})

describe("seek", () => {
  const seekable = STATUSES.filter((status) => status !== "failed")

  test.each(seekable)("seeks to the position while %s", (status) => {
    expect(planCommand({ type: "seek", to: 42.5 }, at(on("b"), { status })).effect).toEqual({
      kind: "seek",
      to: 42.5,
    })
  })

  test("does nothing after a failure", () => {
    expect(planCommand({ type: "seek", to: 42 }, at(on("b"), { status: "failed" })).effect).toEqual(none)
  })

  test.each([
    [-5, 0],
    [500, 200],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])("clamps %d into the track as %d", (to, expected) => {
    expect(planCommand({ type: "seek", to }, at(on("b"))).effect).toEqual({
      kind: "seek",
      to: expected,
    })
  })

  test("has no upper bound while the duration is unknown", () => {
    expect(planCommand({ type: "seek", to: 9000 }, at(on("b"), { duration: null })).effect).toEqual({
      kind: "seek",
      to: 9000,
    })
  })
})

describe("selection", () => {
  for (const mode of MODES)
    test.each(STATUSES)(
      `select-track selects and plays nothing while %s, repeat ${mode.repeat}, shuffle ${mode.shuffle}`,
      (status) => {
        const intent = on("b", mode)
        const plan = planCommand({ type: "select-track", id: "c" }, at(intent, { status }))

        expect(plan.effect).toEqual(none)
        expect(plan.intent.queue).toBe(intent.queue)
        expect(plan.intent.selected).toBe("c")
      }
    )

  test("select-track null clears it, and an unknown id changes nothing", () => {
    const intent = after([{ type: "select-track", id: "c" }])

    expect(planCommand({ type: "select-track", id: null }, at(intent)).intent.selected).toBeNull()
    expect(planCommand({ type: "select-track", id: "zz" }, at(intent))).toEqual({ intent, effect: none })
  })

  test("play-track selects the row it plays, current or not", () => {
    const intent = after([{ type: "select-track", id: "c" }])

    expect(planCommand({ type: "play-track", id: "b" }, at(intent)).intent.selected).toBe("b")
    expect(planCommand({ type: "play-track", id: "a" }, at(intent)).intent.selected).toBe("a")
  })

  test("Next, Previous, and the end of a track leave the selection where it was", () => {
    const intent = after([
      { type: "play-track", id: "b" },
      { type: "select-track", id: "a" },
    ])

    expect(planCommand({ type: "next" }, at(intent)).intent.selected).toBe("a")
    expect(planCommand({ type: "previous" }, at(intent)).intent.selected).toBe("a")
    expect(planEnded({ playlist, intent }).intent.selected).toBe("a")
  })

  test("the selection clears when the list drops its track, and stays otherwise", () => {
    const intent = after([{ type: "select-track", id: "c" }])

    expect(reconcilePlaylist(intent, playlist, parsePlaylist(TRACKS.slice(0, 2)).playlist).selected).toBeNull()
    expect(reconcilePlaylist(intent, playlist, parsePlaylist([...TRACKS].reverse()).playlist).selected).toBe("c")
  })

  test("the snapshot shows the selection apart from the current track", () => {
    const state = deriveState({ ...inputs({ current: "b" }), intent: planCommand({ type: "select-track", id: "c" }, at(on("b"))).intent }, null)

    expect(state.selected).toBe("c")
    expect(state.current?.track.id).toBe("b")
  })
})

describe("settings", () => {
  const empty = parsePlaylist([]).playlist

  test("change with no tracks, and nothing plays", () => {
    const intent = after(
      [
        { type: "set-level", level: 0.25 },
        { type: "set-muted", muted: true },
        { type: "set-shuffle", shuffle: true },
        { type: "set-repeat", repeat: "one" },
        { type: "set-time", time: "remaining" },
      ],
      empty
    )

    expect(intent.settings).toEqual({
      level: 0.25,
      muted: true,
      shuffle: true,
      repeat: "one",
      time: "remaining",
    })
    expect(currentOf(intent.queue)).toBeNull()
  })

  test.each<PlayerCommand>([
    { type: "toggle" },
    { type: "next" },
    { type: "previous" },
    { type: "play-track", id: "a" },
    { type: "seek", to: 3 },
  ])("%o does nothing with no tracks", (command) => {
    const intent = after([], empty)

    expect(planCommand(command, { ...at(intent), playlist: empty })).toEqual({ intent, effect: none })
  })

  test.each<[number, number]>([
    [0.4, 0.4],
    [1.5, 1],
    [-1, 0],
  ])("level %d is kept as %d", (level, expected) => {
    expect(after([{ type: "set-level", level }]).settings.level).toBe(expected)
  })

  test("a level that is not a number changes nothing", () => {
    const intent = after([{ type: "set-level", level: 0.3 }])

    expect(planCommand({ type: "set-level", level: Number.NaN }, at(intent)).intent).toBe(intent)
  })

  test("any level above 0 unmutes, and 0 keeps the mute", () => {
    const muted = after([{ type: "set-muted", muted: true }])

    expect(planCommand({ type: "set-level", level: 0 }, at(muted)).intent.settings.muted).toBe(true)
    expect(planCommand({ type: "set-level", level: 0.1 }, at(muted)).intent.settings.muted).toBe(false)
  })

  test("a setting that does not change keeps the same intent, and none plays", () => {
    const intent = after([{ type: "set-repeat", repeat: "all" }])

    for (const command of [
      { type: "set-repeat", repeat: "all" },
      { type: "set-level", level: 1 },
      { type: "set-muted", muted: false },
      { type: "set-shuffle", shuffle: false },
      { type: "set-time", time: "elapsed" },
    ] as const)
      expect(planCommand(command, at(intent))).toEqual({ intent, effect: none })
  })

  test("repeat and time keep the queue", () => {
    const intent = on("b")

    expect(planCommand({ type: "set-repeat", repeat: "one" }, at(intent)).intent.queue).toBe(intent.queue)
    expect(planCommand({ type: "set-time", time: "remaining" }, at(intent)).intent.queue).toBe(intent.queue)
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

/** The store's inputs with `current` played from the first track, which is current by default. */
function inputs({
  current = "a",
  ...overrides
}: Partial<StoreInputs> & { readonly current?: string } = {}): StoreInputs {
  const list = overrides.playlist ?? playlist

  return {
    playlist: list,
    intent: after(current === "a" ? [] : [{ type: "play-track", id: current }], list),
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
      inputs({ playlist: parsePlaylist([]).playlist }),
      null
    )

    expect(state.current).toBeNull()
    expect(state.summary).toEqual({ kind: "empty" })
    expect(state.active).toBe(false)
  })

  test("the summary carries the status and the current track", () => {
    const state = deriveState(
      inputs({ current: "b", source: file("playing"), station: running }),
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
      inputs({ current: "c", source: file("ended"), station: running }),
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
        current: "b",
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
    expect(deriveState(inputs({ playlist, decoded, current: "b" }), null).current?.peaks).toEqual([0.1])
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

  test("canNext is false on the last track with repeat off", () => {
    expect(deriveState(inputs({ current: "b" }), null).canNext).toBe(true)
    expect(deriveState(inputs({ current: "c" }), null).canNext).toBe(false)
  })
})

describe("wantedLoads", () => {
  const all = { durations: true, current: true, peaks: true }
  const peaksOnly = { durations: false, current: false, peaks: true }
  const nothing = { durations: false, current: false, peaks: false }

  test("probes the idle current track first, then the Playlist's other tracks", () => {
    const state = deriveState(inputs({ current: "b" }), null)

    expect(wantedLoads(state, { ...all, peaks: false }, new Set(), null)).toEqual([
      { kind: "duration", id: "b" },
      { kind: "duration", id: "a" },
      { kind: "duration", id: "c" },
    ])
  })

  test("asks for the current track's peaks before the first play, and skips loads that settled", () => {
    const idle = deriveState(inputs(), null)
    const playing = deriveState(inputs({ station: running, source: file("playing") }), null)

    expect(wantedLoads(idle, peaksOnly, new Set(), null)).toEqual([{ kind: "peaks", id: "a" }])
    expect(wantedLoads(playing, all, new Set(["duration:b"]), null)).toEqual([
      { kind: "duration", id: "c" },
      { kind: "peaks", id: "a" },
    ])
    expect(wantedLoads(idle, peaksOnly, new Set(["peaks:a"]), null)).toEqual([])
  })

  test("preloads the track Next plays while the current one plays, whatever the views need", () => {
    const playing = deriveState(inputs({ station: running, source: file("playing") }), null)

    expect(wantedLoads(playing, nothing, new Set(), "b" as TrackId)).toEqual([
      { kind: "preload", id: "b" },
    ])
    expect(wantedLoads(playing, nothing, new Set(["preload:b"]), "b" as TrackId)).toEqual([])
  })

  test.each<[string, Partial<StoreInputs>]>([
    ["idle", {}],
    ["paused", { station: running, source: file("paused") }],
  ])("preloads nothing while %s", (_, overrides) => {
    expect(wantedLoads(deriveState(inputs(overrides), null), nothing, new Set(), "b" as TrackId)).toEqual([])
  })

  test("preloads nothing under repeat one, or with no next track", () => {
    const looping = deriveState(
      {
        ...inputs({ station: running, source: file("playing") }),
        intent: after([{ type: "set-repeat", repeat: "one" }]),
      },
      null
    )
    const playing = deriveState(inputs({ station: running, source: file("playing") }), null)

    expect(wantedLoads(looping, nothing, new Set(), "b" as TrackId)).toEqual([])
    expect(wantedLoads(playing, nothing, new Set(), null)).toEqual([])
  })

  test("never preloads a person's file", () => {
    const [own] = parseFiles([new File(["x"], "own.mp3", { type: "audio/mpeg" })], 0).tracks
    const list = joinPlaylist(parsePlaylist(TRACKS.slice(0, 1)).playlist, [own])
    const state = deriveState(inputs({ playlist: list, station: running, source: file("playing") }), null)

    expect(state.canNext).toBe(true)
    expect(wantedLoads(state, nothing, new Set(), own.id)).toEqual([])
  })

  test("runs nothing nobody needs", () => {
    const state = deriveState(inputs({ source: file("playing") }), null)

    expect(wantedLoads(state, nothing, new Set(), null)).toEqual([])
  })
})
