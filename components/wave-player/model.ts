/*
 * The player's pure core: the snapshot every view renders, the transport
 * rules, and the background loads the store should run. No React, no DOM,
 * no audio calls, so tools/wave-player/model.test.ts covers every rule
 * without a browser.
 *
 * Each piece of state has one writer, and nothing here copies another's:
 *
 *   intent     the store, only through a Plan from planCommand() or planEnded(),
 *              or reconcilePlaylist() when the list changes. It holds the
 *              queue, the settings, and the selected row. The current
 *              track's index is looked up from the queue, never stored.
 *   playback   the strip. Its SourceStatus describes the current track.
 *   station    kevelle/audio's context state
 *   durations  the site (Track.duration), the playing element (heard), and
 *              metadata probes (probed), merged by deriveState() at the read
 *   peaks      the site (Track.peaks) and the decoder (decoded)
 *
 * `active` has no writer. deriveState() reads it from the station, the
 * queue, and the status, so it can never disagree with them. Neither has
 * `look`: it is the current track's look, else the block's default.
 *
 * Reading the strip's status without a track id is safe because only a
 * "load" Effect changes the strip's source, and it always plays the plan's
 * current track. Every other change of current happens with that load.
 */

import {
  toSeconds,
  type FeedError,
  type Result,
  type SampleFeed,
  type Seconds,
  type SourceError,
  type SourceStatus,
  type StationSnapshot,
} from "@/lib/audio/index"

import { currentLook, type WavePlayerLook } from "./look"
import type { Peaks } from "./peaks"
import type { Playlist, TrackId } from "./playlist"
import {
  activate,
  advance,
  createQueue,
  currentOf,
  reconcile,
  reseed,
  reshuffle,
  retreat,
  type Queue,
} from "./queue"
import { DEFAULT_SETTINGS, type Settings } from "./settings"
import { STATUS_VIEW } from "./status-view"

export type FailReason =
  /** The track did not load: a network error, a 404, a host without CORS, or a file the browser can't decode. */
  | "load"
  /** The page's audio context failed or closed. */
  | "audio"
  /** No Web Audio or AudioWorklet, or an insecure page. */
  | "unsupported"

/**
 * What the current track is doing, merged from the strip, the station, and
 * support. Each value is one shared constant, so a status keeps its identity
 * until it changes.
 */
export type PlayerStatus =
  /** Nothing loaded: before the first play, after a cancel, or after the list dropped the track. */
  | { readonly kind: "idle" }
  /** The strip is opening the track. */
  | { readonly kind: "loading" }
  | { readonly kind: "playing" }
  | { readonly kind: "paused" }
  /**
   * The browser refused to start without a gesture, or the system holds the
   * context under a playing track. The next press of Play retries.
   */
  | { readonly kind: "blocked" }
  /** The last track finished and stays current. Play starts it again. */
  | { readonly kind: "ended" }
  | { readonly kind: "failed"; readonly reason: FailReason }

export type StatusKind = PlayerStatus["kind"]

const IDLE: PlayerStatus = { kind: "idle" }

const LOADING: PlayerStatus = { kind: "loading" }

const PLAYING: PlayerStatus = { kind: "playing" }

const PAUSED: PlayerStatus = { kind: "paused" }

const BLOCKED: PlayerStatus = { kind: "blocked" }

const ENDED: PlayerStatus = { kind: "ended" }

const FAILED = {
  load: { kind: "failed", reason: "load" },
  audio: { kind: "failed", reason: "audio" },
  unsupported: { kind: "failed", reason: "unsupported" },
} as const satisfies Record<FailReason, PlayerStatus>

/** A track as the views show it. No src and no raw peaks; those stay in the store. */
export type TrackInfo = {
  readonly id: TrackId
  readonly title: string
  readonly artist: string | null
  readonly record: string | null
  readonly tag: string | null
  /** The site's, else the playing element's, else one the element heard earlier, else a probe's. Null until one is known. */
  readonly duration: Seconds | null
}

export type CurrentTrack = {
  readonly index: number
  /** The same object as tracks[index]. */
  readonly track: TrackInfo
  /** The site's peaks, else decoded ones. Null until either exists; the seek bar then draws uniform low bars. */
  readonly peaks: Peaks | null
}

/** The current track as useWavePlayer() reports it. */
export type WavePlayerTrackInfo = {
  readonly id: string
  readonly title: string
  readonly artist: string | null
  readonly record: string | null
  /** From 0. */
  readonly index: number
  readonly count: number
}

/** What useWavePlayer() reports: "empty" with no tracks, else the status and the current track. */
export type WavePlayerStatus =
  | { readonly kind: "empty" }
  | {
      readonly kind: Exclude<StatusKind, "failed">
      readonly track: WavePlayerTrackInfo
    }
  | {
      readonly kind: "failed"
      readonly reason: FailReason
      readonly track: WavePlayerTrackInfo
    }

const EMPTY: WavePlayerStatus = { kind: "empty" }

/**
 * The snapshot the store publishes. getSnapshot() returns the same object
 * until a field changes, and an unchanged row in `tracks` keeps its identity.
 */
export type PlayerState = {
  readonly tracks: readonly TrackInfo[]
  /** Null exactly when `tracks` is empty. */
  readonly current: CurrentTrack | null
  readonly status: PlayerStatus
  /** The strip's tap. Null with no context yet, while the tap loads, or when its worklet failed. */
  readonly feed: SampleFeed | null
  /** The public status, kept stable while its fields are. */
  readonly summary: WavePlayerStatus
  /**
   * Playback is under way: the first sounding gesture opened the strip, a
   * track is current, and the last track has not ended. A pause, a cancelled
   * load, and a failed track keep it, so Retry and Next stay where the
   * listener can reach them. A browser without Web Audio never opens the
   * strip, so it never turns true. Replay after the end turns it true again.
   * Hosts mount the mini player and the bar by it, through useWavePlayer().
   */
  readonly active: boolean
  /**
   * The current track's look, else the block's default player look, never
   * a site's. The same object until its content changes. useWavePlayer()
   * hands it to the site's screen.
   */
  readonly look: WavePlayerLook
  /** The same object until a setting changes. */
  readonly settings: Settings
  /** Next has a track to play: peekNext() is not null. */
  readonly canNext: boolean
  /** The Playlist's selected row. Never the same thing as current: selecting plays nothing, and playback never moves it. */
  readonly selected: TrackId | null
}

/** Everything deriveState() reads. The store assembles it; the states workbench builds it by hand. */
export type StoreInputs = {
  readonly playlist: Playlist
  readonly intent: Intent
  /** The strip's status, or { kind: "none" } before the first play. */
  readonly source: SourceStatus
  /** Null until the first play opens the strip. */
  readonly station: StationSnapshot | null
  readonly feed: Result<SampleFeed, FeedError> | null
  /** The first play found no Web Audio. */
  readonly unsupported: boolean
  /**
   * A load asked the element to play, and the strip has not yet reported it
   * playing, blocked, ended, or failed. The strip reports "paused" from the
   * track's metadata until its first `playing` event, which this reads as
   * still loading.
   */
  readonly awaitingPlay: boolean
  readonly heard: ReadonlyMap<string, Seconds>
  readonly probed: ReadonlyMap<string, Seconds>
  readonly decoded: ReadonlyMap<string, Peaks>
}

/** Builds the snapshot, reusing `previous` and its rows wherever nothing changed. */
export function deriveState(
  inputs: StoreInputs,
  previous: PlayerState | null
): PlayerState {
  const status = deriveStatus(inputs)
  const index = indexOf(inputs.playlist, inputs.intent)

  const playing = inputs.source.kind === "file" ? inputs.source.duration : null

  const rows = inputs.playlist.tracks.map((track, at) => {
    const row: TrackInfo = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      record: track.record,
      tag: track.tag,
      duration:
        track.duration ??
        (index === at ? playing : null) ??
        inputs.heard.get(track.id) ??
        inputs.probed.get(track.id) ??
        null,
    }

    const old = previous?.tracks[at]

    return old && sameRow(old, row) ? old : row
  })

  const tracks =
    previous &&
    rows.length === previous.tracks.length &&
    rows.every((row, index) => row === previous.tracks[index])
      ? previous.tracks
      : rows

  const current = currentTrack(inputs, index, tracks, previous?.current ?? null)
  const feed = inputs.feed?.ok ? inputs.feed.value : null
  const summary = summarize(status, current, tracks.length, previous)

  const active =
    inputs.station !== null && current !== null && status.kind !== "ended"

  const look = currentLook(
    index === null ? null : inputs.playlist.tracks[index].look,
    previous?.look ?? null
  )

  const settings = inputs.intent.settings
  const selected = inputs.intent.selected
  const canNext = peekNext(inputs.playlist, inputs.intent) !== null

  if (
    previous &&
    previous.tracks === tracks &&
    previous.current === current &&
    previous.status === status &&
    previous.feed === feed &&
    previous.summary === summary &&
    previous.active === active &&
    previous.look === look &&
    previous.settings === settings &&
    previous.canNext === canNext &&
    previous.selected === selected
  )
    return previous

  return {
    tracks,
    current,
    status,
    feed,
    summary,
    active,
    look,
    settings,
    canNext,
    selected,
  }
}

/** The current track's position in the list. Null exactly when the list is empty. */
function indexOf(playlist: Playlist, intent: Intent): number | null {
  const id = currentOf(intent.queue)

  return id === null ? null : (playlist.indexOf.get(id) ?? null)
}

function sameRow(a: TrackInfo, b: TrackInfo): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.artist === b.artist &&
    a.record === b.record &&
    a.tag === b.tag &&
    a.duration === b.duration
  )
}

function currentTrack(
  inputs: StoreInputs,
  index: number | null,
  tracks: readonly TrackInfo[],
  previous: CurrentTrack | null
): CurrentTrack | null {
  if (index === null) return null

  const track = tracks[index]
  const source = inputs.playlist.tracks[index]

  const peaks = source.peaks ?? inputs.decoded.get(source.id) ?? null

  if (
    previous &&
    previous.index === index &&
    previous.track === track &&
    previous.peaks === peaks
  )
    return previous

  return { index, track, peaks }
}

function summarize(
  status: PlayerStatus,
  current: CurrentTrack | null,
  count: number,
  previous: PlayerState | null
): WavePlayerStatus {
  if (!current) return EMPTY

  const old = previous?.summary

  if (
    old &&
    old.kind !== "empty" &&
    previous?.status === status &&
    old.track.id === current.track.id &&
    old.track.title === current.track.title &&
    old.track.artist === current.track.artist &&
    old.track.record === current.track.record &&
    old.track.index === current.index &&
    old.track.count === count
  )
    return old

  const track: WavePlayerTrackInfo = {
    id: current.track.id,
    title: current.track.title,
    artist: current.track.artist,
    record: current.track.record,
    index: current.index,
    count,
  }

  return status.kind === "failed"
    ? { kind: "failed", reason: status.reason, track }
    : { kind: status.kind, track }
}

/**
 * Merges support, the strip, and the station, in this order: unsupported, a
 * failed source, a failed station, then the source's own state. A playing
 * element under a context the system holds reads "blocked", since only a
 * gesture brings the sound back. A loaded track that has not started yet
 * reads "loading", not "paused".
 */
export function deriveStatus({
  source,
  station,
  unsupported,
  awaitingPlay,
}: Pick<
  StoreInputs,
  "source" | "station" | "unsupported" | "awaitingPlay"
>): PlayerStatus {
  if (unsupported) return FAILED.unsupported

  if (source.kind === "failed") return FAILED[failReason(source.error)]

  if (station?.state === "failed") return FAILED.audio

  switch (source.kind) {
    case "none":
    case "tones":
    case "input":
      return IDLE
    case "connecting":
      return LOADING
    case "file":
      switch (source.playback) {
        case "blocked":
          return BLOCKED
        case "playing":
          return station?.state === "suspended" && station.by === "system"
            ? BLOCKED
            : PLAYING
        case "paused":
          return awaitingPlay ? LOADING : PAUSED
        case "ended":
          return ENDED
        default:
          return source.playback satisfies never
      }

    default:
      return source satisfies never
  }
}

/** "station-not-running" is the context's failure; every other error means the track didn't load. */
function failReason(error: SourceError): FailReason {
  return error.kind === "station-not-running" ? "audio" : "load"
}

/** What the listener asked for: where the queue stands, the settings, and the selected row. The store's one copy. */
export type Intent = {
  readonly queue: Queue
  readonly settings: Settings
  readonly selected: TrackId | null
}

/** The first track current and idle, default settings, and a fixed seed until the store draws one. */
export function initialIntent(playlist: Playlist): Intent {
  return {
    queue: createQueue(order(playlist), DEFAULT_SETTINGS.shuffle, 0),
    settings: DEFAULT_SETTINGS,
    selected: null,
  }
}

/** The same intent on a new random state. The store calls it once, from a gesture, never during render. */
export function reseedIntent(intent: Intent, seed: number): Intent {
  return { ...intent, queue: reseed(intent.queue, seed) }
}

/**
 * The intent after the list changed: the queue keeps only listed tracks
 * (see reconcile() in queue.ts), and a selection the list dropped clears.
 * Settings never change.
 */
export function reconcilePlaylist(intent: Intent, playlist: Playlist): Intent {
  return {
    ...intent,
    queue: reconcile(intent.queue, order(playlist), intent.settings.shuffle),
    selected:
      intent.selected !== null && playlist.indexOf.has(intent.selected)
        ? intent.selected
        : null,
  }
}

/**
 * The track Next plays, or null when Next does nothing. Repeat all wraps to
 * a new round; repeat one does not, since a manual Next leaves the loop.
 * Reads the queue's seed without advancing it, so Next then plays this track.
 */
export function peekNext(playlist: Playlist, intent: Intent): TrackId | null {
  const ahead = advance(
    intent.queue,
    order(playlist),
    intent.settings.shuffle,
    intent.settings.repeat === "all"
  )

  return ahead ? currentOf(ahead) : null
}

function order(playlist: Playlist): readonly TrackId[] {
  return playlist.tracks.map((track) => track.id)
}

/**
 * Everything a person, a key, or Media Session can ask for. Views call
 * onCommand, and Media Session handlers call the same store.send().
 */
export type PlayerCommand =
  /** The center button and Space. */
  | { readonly type: "toggle" }
  /** Media Session's play and pause, which must not toggle. */
  | { readonly type: "play" }
  | { readonly type: "pause" }
  | { readonly type: "next" }
  | { readonly type: "previous" }
  /** A Playlist row's play action. It also selects the row. An unknown id does nothing. */
  | { readonly type: "play-track"; readonly id: string }
  /** A Playlist row's selection, or null for none. It never plays. An unknown id does nothing. */
  | { readonly type: "select-track"; readonly id: string | null }
  /** Seconds. The plan clamps it into the track. */
  | { readonly type: "seek"; readonly to: number }
  /** 0 to 1, clamped. Any level above 0 unmutes. */
  | { readonly type: "set-level"; readonly level: number }
  | { readonly type: "set-muted"; readonly muted: boolean }
  | { readonly type: "set-shuffle"; readonly shuffle: boolean }
  | { readonly type: "set-repeat"; readonly repeat: Settings["repeat"] }
  | { readonly type: "set-time"; readonly time: Settings["time"] }

/** Previous restarts the track when the position is past this, strictly; at 3.0 s it goes back a track. */
const RESTART_AFTER = 3

/** What the store knows when a command arrives. */
export type Situation = {
  readonly playlist: Playlist
  readonly intent: Intent
  readonly status: StatusKind
  /** Read from the file handle when the command arrives, not from the last frame. */
  readonly position: number
  readonly duration: Seconds | null
  /** A file handle exists for the current track. */
  readonly loaded: boolean
  /** False after a failure retrying can't fix, such as No Web Audio. */
  readonly retry: boolean
}

/**
 * What the store does to the strip. "load" is the only effect that changes
 * the strip's source, and it always plays the plan's current track.
 */
export type Effect =
  | { readonly kind: "none" }
  /** strip.play() for the plan's track, from 0 or from a seek made before it loaded. */
  | { readonly kind: "load" }
  /** handle.play(): from the paused position, or from the top after the end. Loads when no handle exists. */
  | { readonly kind: "resume" }
  /** handle.seek(0), then handle.play(). Loads when no handle exists. */
  | { readonly kind: "restart" }
  | { readonly kind: "pause" }
  /** strip.stop() on a track still loading. It stays current, idle. */
  | { readonly kind: "cancel" }
  /** handle.seek(), or held until the track loads. */
  | { readonly kind: "seek"; readonly to: Seconds }

/** The intent to keep and what to do to the strip. An unchanged intent is the same object. */
export type Plan = { readonly intent: Intent; readonly effect: Effect }

const NONE: Effect = { kind: "none" }

const LOAD: Effect = { kind: "load" }

const RESUME: Effect = { kind: "resume" }

const RESTART: Effect = { kind: "restart" }

const PAUSE: Effect = { kind: "pause" }

const CANCEL: Effect = { kind: "cancel" }

const TOGGLE = {
  idle: LOAD,
  loading: CANCEL,
  playing: PAUSE,
  paused: RESUME,
  blocked: RESUME,
  ended: RESUME,
  failed: LOAD,
} as const satisfies Record<StatusKind, Effect>

const CURRENT_ROW = {
  idle: LOAD,
  loading: NONE,
  playing: NONE,
  paused: RESUME,
  blocked: RESUME,
  ended: RESTART,
  failed: LOAD,
} as const satisfies Record<StatusKind, Effect>

/**
 * The transport and settings rules:
 *
 *   toggle      TOGGLE above, but nothing on a failure retrying can't fix
 *   play        as toggle, but nothing while loading or playing
 *   pause       playing pauses, loading cancels, otherwise nothing
 *   next        peekNext()'s track, playing, even from paused; nothing
 *               when it is null
 *   previous    more than 3 s into a loaded track restarts it; otherwise the
 *               track played before, playing; with none, the track restarts,
 *               or loads when it has not loaded yet
 *   play-track  another track loads it and starts a new round after it; the
 *               current one follows CURRENT_ROW
 *   seek        clamped into [0, duration], while the status allows seeking
 *   select-track  selects a row and nothing else, even while playing
 *   set-*       change the setting and nothing else, even with no tracks.
 *               Shuffle rebuilds the round after current.
 *
 * Next and previous always end up playing: each arrives in a gesture, so
 * the play is allowed, and no "cued but silent" state exists.
 */
export function planCommand(command: PlayerCommand, at: Situation): Plan {
  const { intent } = at
  const stay = (effect: Effect): Plan => ({ intent, effect })

  switch (command.type) {
    case "set-level":
      if (!Number.isFinite(command.level)) return stay(NONE)

      return configure(intent, {
        level: Math.min(1, Math.max(0, command.level)),
        muted: command.level > 0 ? false : intent.settings.muted,
      })
    case "set-muted":
      return configure(intent, { muted: command.muted })
    case "set-shuffle": {
      const next = configure(intent, { shuffle: command.shuffle })

      if (next.intent === intent) return next

      return {
        intent: {
          ...next.intent,
          queue: reshuffle(intent.queue, order(at.playlist), command.shuffle),
        },
        effect: NONE,
      }
    }

    case "set-repeat":
      return configure(intent, { repeat: command.repeat })
    case "set-time":
      return configure(intent, { time: command.time })
    case "select-track": {
      if (command.id === null) return { intent: select(intent, null), effect: NONE }

      const id = find(at.playlist, command.id)

      return id === null ? stay(NONE) : { intent: select(intent, id), effect: NONE }
    }

    default:
      return intent.queue.kind === "empty"
        ? stay(NONE)
        : planTransport(command, at, intent.queue)
  }
}

type Transport = Exclude<
  PlayerCommand,
  { readonly type: `set-${string}` | "select-track" }
>

function planTransport(
  command: Transport,
  at: Situation,
  queue: Queue & { readonly kind: "ready" }
): Plan {
  const { intent } = at
  const stay = (effect: Effect): Plan => ({ intent, effect })

  // Retry is off where it can't help, so Space, Play, and the current row
  // stay quiet there too.
  if (at.status === "failed" && !at.retry) {
    if (command.type === "toggle" || command.type === "play") return stay(NONE)

    if (command.type === "play-track" && command.id === queue.current)
      return stay(NONE)
  }

  switch (command.type) {
    case "toggle":
      return stay(TOGGLE[at.status])
    case "play":
      return stay(
        at.status === "loading" || at.status === "playing"
          ? NONE
          : TOGGLE[at.status]
      )
    case "pause":
      return stay(
        at.status === "playing"
          ? PAUSE
          : at.status === "loading"
            ? CANCEL
            : NONE
      )
    case "next": {
      const ahead = advance(
        queue,
        order(at.playlist),
        intent.settings.shuffle,
        intent.settings.repeat === "all"
      )

      return ahead ? move(intent, ahead) : stay(NONE)
    }

    case "previous": {
      if (at.loaded && at.position > RESTART_AFTER) return stay(RESTART)

      const back = retreat(queue)

      if (back) return move(intent, back)

      return stay(at.loaded ? RESTART : LOAD)
    }

    case "play-track": {
      const id = find(at.playlist, command.id)

      if (id === null) return stay(NONE)

      if (id === queue.current)
        return { intent: select(intent, id), effect: CURRENT_ROW[at.status] }

      return {
        intent: {
          ...select(intent, id),
          queue: activate(
            queue,
            id,
            order(at.playlist),
            intent.settings.shuffle
          ),
        },
        effect: LOAD,
      }
    }

    case "seek":
      if (!STATUS_VIEW[at.status].seekable) return stay(NONE)

      return stay({ kind: "seek", to: seekTo(command.to, at.duration) })
    default:
      return command satisfies never
  }
}

/** A seek target clamped into [0, duration]. Not a number reads as 0; no upper bound while the duration is unknown. */
export function seekTo(to: number, duration: Seconds | null): Seconds {
  return toSeconds(
    Math.min(duration ?? Infinity, Math.max(0, Number.isFinite(to) ? to : 0))
  )
}

/**
 * The strip reported the current track's end. Repeat one restarts it, in
 * case the element's own loop did not; otherwise the track Next would play
 * loads. With none, stay, so the status reads ended.
 */
export function planEnded(
  at: Pick<Situation, "playlist" | "intent">
): Plan {
  const { intent } = at

  if (intent.queue.kind === "empty") return { intent, effect: NONE }

  if (intent.settings.repeat === "one") return { intent, effect: RESTART }

  const ahead = advance(
    intent.queue,
    order(at.playlist),
    intent.settings.shuffle,
    intent.settings.repeat === "all"
  )

  return ahead ? move(intent, ahead) : { intent, effect: NONE }
}

/** Plays the moved queue's current track: restarts it when the move landed on the same one, as repeat all on one track does. */
function move(intent: Intent, queue: Queue): Plan {
  return {
    intent: { ...intent, queue },
    effect: currentOf(queue) === currentOf(intent.queue) ? RESTART : LOAD,
  }
}

/** The listed track with this id. Commands carry plain strings; this is where one becomes a TrackId. */
function find(playlist: Playlist, id: string): TrackId | null {
  const at = playlist.indexOf.get(id)

  return at === undefined ? null : playlist.tracks[at].id
}

function select(intent: Intent, id: TrackId | null): Intent {
  return intent.selected === id ? intent : { ...intent, selected: id }
}

/** The intent with `change` applied, or the same intent when nothing differs. */
function configure(intent: Intent, change: Partial<Settings>): Plan {
  const settings = { ...intent.settings, ...change }
  const same = (Object.keys(settings) as (keyof Settings)[]).every(
    (key) => settings[key] === intent.settings[key]
  )

  return { intent: same ? intent : { ...intent, settings }, effect: NONE }
}

/** The effect makes sound, so the store opens the strip and starts the station first, in the same gesture. */
export function startsAudio(effect: Effect): boolean {
  return (
    effect.kind === "load" ||
    effect.kind === "resume" ||
    effect.kind === "restart"
  )
}

/** A duration probe or a peaks decode for one track. */
export type Load =
  | { readonly kind: "duration"; readonly id: string }
  | { readonly kind: "peaks"; readonly id: string }

/**
 * What the mounted views need. "durations": every track's duration (the
 * Playlist). "current": the current track's duration (every other view).
 * "peaks": the current track's peaks (the card's seek bar).
 */
export type Need = "durations" | "current" | "peaks"

export type Demand = Readonly<Record<Need, boolean>>

/** "duration:<id>" or "peaks:<id>": the key for running loads and for loads that failed. */
export function loadKey(load: Load): string {
  return `${load.kind}:${load.id}`
}

/**
 * The loads the store should run, in priority order. The store starts what
 * is missing and aborts what is no longer listed, so reconciling twice
 * changes nothing.
 *
 *   durations  the current track's while it sits idle without one (once
 *              loading, the element reports it), then, for the Playlist,
 *              every other track without one
 *   peaks      the current track's, without peaks, once playback has run
 *
 * A load that failed or timed out stays failed for the page.
 */
export function wantedLoads(
  state: PlayerState,
  demand: Demand,
  failed: ReadonlySet<string>
): readonly Load[] {
  const current = state.current
  const loads: Load[] = []

  if (
    current &&
    (demand.current || demand.durations) &&
    current.track.duration === null &&
    state.status.kind === "idle"
  )
    loads.push({ kind: "duration", id: current.track.id })

  if (demand.durations)
    state.tracks.forEach((track, index) => {
      if (track.duration === null && index !== current?.index)
        loads.push({ kind: "duration", id: track.id })
    })

  if (
    current &&
    demand.peaks &&
    current.peaks === null &&
    STATUS_VIEW[state.status.kind].started
  )
    loads.push({ kind: "peaks", id: current.track.id })

  return loads.filter((load) => !failed.has(loadKey(load)))
}
