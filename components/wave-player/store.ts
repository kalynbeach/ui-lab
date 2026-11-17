/*
 * The WavePlayer store: one per provider, and nothing in it knows React.
 *
 * It owns the block's one strip, the intent (queue and settings), the file handle, the
 * position samples, Media Session, and the duration and peaks caches. Views
 * read subscribe() and getSnapshot(), and the playhead for position. Every
 * change of intent goes through send().
 *
 * Construction touches no window, station, or navigator, so the provider
 * can build the store during render on the server and the client, and both
 * derive the same first snapshot. Resources arrive inside the first gesture
 * that makes sound: send() opens the strip, subscribes, binds Media Session,
 * starts the station, and calls strip.play(), all before it returns.
 * release() gives everything back and leaves the store usable, so a
 * StrictMode remount and a real one take the same path.
 *
 * Browser timing rules live here, where React's commit timing can't reach
 * them. WebKit starts a media element only from a gesture's own call stack,
 * so nothing awaits between a click and strip.play(). It also allows a
 * play() without a gesture within about a second of a media `ended` event,
 * so the next track starts inside the strip listener that reports `ended`.
 *
 * Every input change ends in commit(). Each of its steps converges, so a
 * re-entrant commit (the strip calls back inside strip.play()) is harmless.
 * Output is one of those steps: commit() sets the strip's level and monitor
 * and the handle's loop flag to what the settings ask, when they differ from
 * what it last set, so a setting needs no effect of its own.
 */

import {
  detectAudioSupport,
  getAudioStation,
  toSeconds,
  type AudioStation,
  type FileHandle,
  type Seconds,
  type SourceStatus,
  type Strip,
  type StripOptions,
} from "@/lib/audio/index"

import { decodePeaks, probeDuration } from "./loaders"
import {
  deriveState,
  initialIntent,
  loadKey,
  planCommand,
  planEnded,
  reconcilePlaylist,
  reseedIntent,
  seekTo,
  startsAudio,
  wantedLoads,
  type Effect,
  type Intent,
  type Load,
  type Need,
  type PlayerCommand,
  type PlayerState,
  type StoreInputs,
} from "./model"
import {
  createNowPlaying,
  describeNowPlaying,
  type NowPlaying,
} from "./now-playing"
import type { Peaks } from "./peaks"
import type { Playhead } from "./playhead"
import {
  parsePlaylist,
  type PlaylistIssue,
  type Track,
  type TrackId,
  type WavePlayerTrack,
} from "./playlist"
import { currentOf } from "./queue"
import { FAILURE, STATUS_VIEW } from "./status-view"

/** The strip's gain at level 1. Mastered music peaks near 1, and 0.5 keeps it in the master soft clip's linear range. */
const PLAYER_CEILING = 0.5

/** A metadata probe that hears nothing for this long counts as failed, so it can't hold up the probes behind it. */
export const PROBE_TIMEOUT_MS = 10_000

const STRIP_OPTIONS: StripOptions = {
  label: "WavePlayer",
  ceiling: PLAYER_CEILING,
  tap: true,
  // Nothing records input, so the context may take latencyHint "playback".
  captures: false,
}

const NONE: SourceStatus = { kind: "none" }

export type PlayerStore = {
  readonly subscribe: (listener: () => void) => () => void
  /** The same object until something a view shows changes. */
  readonly getSnapshot: () => PlayerState
  /** The snapshot construction built, so hydration reads what the server rendered. */
  readonly getServerSnapshot: () => PlayerState
  readonly playhead: Playhead
  /**
   * The one way to change the player. Call it from the gesture itself, a
   * click, key, or Media Session handler, never after an await.
   */
  readonly send: (command: PlayerCommand) => void
  /**
   * Replaces the playlist. The same content changes nothing. The current
   * track survives by id; when the list drops it, the strip stops and the
   * first track becomes current, idle.
   */
  readonly setTracks: (tracks: readonly WavePlayerTrack[]) => void
  /** A mounted view's need, held until the returned release runs. Loads run only while someone needs them. */
  readonly retain: (need: Need) => () => void
  /**
   * Closes the strip, clears Media Session, aborts loads, and stops the
   * frame loop. Keeps the playlist, the index, the caches, listeners, and
   * needs, and the next gesture opens everything again. Idempotent.
   */
  readonly release: () => void
}

/** The browser, as the store sees it. Tests pass fakes; browserEnv() reads globals only when called. */
export type PlayerEnv = {
  readonly station: () => AudioStation
  readonly support: () => "supported" | "unsupported"
  readonly mediaSession: () => MediaSession | null
  /** A track's src against the page. */
  readonly resolve: (src: string) => URL
  readonly probeDuration: (
    url: URL,
    signal: AbortSignal
  ) => Promise<Seconds | null>
  readonly decodePeaks: (url: URL, signal: AbortSignal) => Promise<Peaks | null>
  /** requestAnimationFrame. Returns a cancel. */
  readonly frame: (callback: () => void) => () => void
  /** setTimeout. Returns a cancel. */
  readonly setTimer: (callback: () => void, ms: number) => () => void
  /** Playlist issues, once per distinct list. */
  readonly report: (issues: readonly PlaylistIssue[]) => void
  /** A 32-bit seed for shuffle. Drawn once, at the first command, never during render. */
  readonly seed: () => number
}

export function browserEnv(): PlayerEnv {
  return {
    station: getAudioStation,
    support: detectAudioSupport,
    mediaSession: () =>
      "mediaSession" in navigator ? navigator.mediaSession : null,
    resolve: (src) => new URL(src, location.href),
    probeDuration,
    decodePeaks,
    frame(callback) {
      const id = requestAnimationFrame(callback)

      return () => cancelAnimationFrame(id)
    },
    setTimer(callback, ms) {
      const id = setTimeout(callback, ms)

      return () => clearTimeout(id)
    },
    report: (issues) =>
      console.warn("WavePlayer dropped track data it could not use.", issues),
    seed: () => Math.floor(Math.random() * 2 ** 32),
  }
}

type OpenAudio = {
  readonly station: AudioStation
  readonly strip: Strip
  readonly unsubscribe: () => void
}

export function createPlayerStore(
  tracks: readonly WavePlayerTrack[],
  env: PlayerEnv = browserEnv()
): PlayerStore {
  const listeners = new Set<() => void>()
  const positionListeners = new Set<() => void>()

  let { playlist } = parsePlaylist(tracks)
  /** The playlist key whose issues were reported. */
  let reported: string | null = null
  /** Written by send(), the strip listener, and setTracks(), each through a plan. */
  let intent: Intent = initialIntent(playlist)
  /** The intent's seed came from env.seed(). The first command draws it. */
  let seeded = false
  /** Open from the first sounding gesture until release(). */
  let audio: OpenAudio | null = null
  let nowPlaying: NowPlaying | null = null
  /** The current track's handle, once strip.play() resolves for the newest load. */
  let handle: FileHandle | null = null
  /** Moved by every load, cancel, and release, so an older play() result never binds. */
  let token = 0
  /** A seek made before the current track loaded, applied when its handle arrives. */
  let pendingSeek: Seconds | null = null
  /** The strip status the listener last acted on, so each `ended` advances once. */
  let seen: SourceStatus = NONE
  let unsupported = false
  let awaitingPlay = false
  const heard = new Map<string, Seconds>()
  const probed = new Map<string, Seconds>()
  const decoded = new Map<string, Peaks>()
  const failedLoads = new Set<string>()
  const running = new Map<string, () => void>()
  const needs: Record<Need, number> = { durations: 0, current: 0, peaks: 0 }
  let position = toSeconds(0)
  /** A seek bar drag's target, tied to the track and the load (token) it began on. */
  let scrub: {
    readonly id: TrackId
    readonly token: number
    readonly to: Seconds
  } | null = null
  let cancelFrame: (() => void) | null = null
  /** What converge() last set. Null forgets it: a new strip or handle starts from its own defaults. */
  const output: {
    level: number | null
    monitor: boolean | null
    loop: boolean | null
  } = { level: null, monitor: null, loop: null }

  const inputs = (): StoreInputs => ({
    playlist,
    intent,
    source: audio?.strip.getStatus() ?? NONE,
    station: audio?.station.getSnapshot() ?? null,
    feed: audio?.strip.getFeed() ?? null,
    unsupported,
    awaitingPlay,
    heard,
    probed,
    decoded,
  })

  const initial = deriveState(inputs(), null)
  let snapshot = initial

  function notify(): void {
    for (const listener of listeners) listener()
  }

  function commit(): void {
    converge()

    if (scrub && (scrub.id !== currentOf(intent.queue) || scrub.token !== token))
      setScrub(null)

    const next = deriveState(inputs(), snapshot)
    const changed = next !== snapshot

    snapshot = next
    // Sample before Media Session reads the position, so a new track
    // reports 0 against its own duration, never the old track's position.
    sample()
    nowPlaying?.render(describeNowPlaying(snapshot, position))
    reconcileLoads()
    syncFrames()

    if (changed) notify()
  }

  /** Opens the strip on the first sounding gesture, before the station starts and the strip plays. */
  function acquire(): OpenAudio {
    if (audio) return audio

    const station = env.station()
    const strip = station.openStrip(STRIP_OPTIONS)

    seen = strip.getStatus()

    const offStrip = strip.subscribe(onAudioChange)
    const offStation = station.subscribe(onAudioChange)

    audio = {
      station,
      strip,
      unsubscribe() {
        offStrip()
        offStation()
      },
    }
    nowPlaying = createNowPlaying(env.mediaSession(), send)
    // A new strip starts silent. Set the level and the monitor before
    // anything plays, so a muted player never sounds.
    output.level = null
    output.monitor = null
    converge()

    return audio
  }

  function converge(): void {
    const { level, muted, repeat } = intent.settings

    if (audio && output.level !== level) {
      audio.strip.setLevel(level)
      output.level = level
    }

    if (audio && output.monitor !== !muted) {
      audio.strip.setMonitor(!muted)
      output.monitor = !muted
    }

    const loop = repeat === "one"

    if (handle && output.loop !== loop) {
      handle.setLoop(loop)
      output.loop = loop
    }
  }

  function currentTrack(): Track | null {
    const id = currentOf(intent.queue)
    const at = id === null ? undefined : playlist.indexOf.get(id)

    return at === undefined ? null : playlist.tracks[at]
  }

  /** Keeps a plan's intent. A seek held for the old current track does not carry over. */
  function adopt(next: Intent): void {
    if (currentOf(next.queue) !== currentOf(intent.queue)) pendingSeek = null

    intent = next
  }

  function send(command: PlayerCommand): void {
    if (!seeded) {
      intent = reseedIntent(intent, env.seed())
      seeded = true
    }

    const plan = planCommand(command, {
      playlist,
      intent,
      status: snapshot.status.kind,
      position: handle?.position() ?? 0,
      duration: snapshot.current?.track.duration ?? null,
      loaded: handle !== null,
      retry:
        snapshot.status.kind !== "failed" ||
        FAILURE[snapshot.status.reason].retry,
    })

    if (plan.intent === intent && plan.effect.kind === "none") return

    if (startsAudio(plan.effect)) {
      if (env.support() === "unsupported") {
        unsupported = true
        commit()

        return
      }

      // start() creates or resumes the context and attaches the strip
      // synchronously, before its first await. Calling it on every sounding
      // gesture also recovers a context Safari suspended "by system".
      void acquire().station.start()
      // A gesture that starts playback takes the OS media controls back from
      // any player that played since. The commit below writes them.
      nowPlaying?.claim()
    }

    // The new intent first: strip.play() calls back into commit() before it returns.
    adopt(plan.intent)
    apply(plan.effect)
    commit()
  }

  function apply(effect: Effect): void {
    switch (effect.kind) {
      case "none":
        return
      case "load":
        load()

        return
      case "resume":
        if (handle) void handle.play()
        else load()

        return
      case "restart":
        if (handle) {
          handle.seek(toSeconds(0))
          void handle.play()
        } else {
          pendingSeek = null
          load()
        }

        return
      case "pause":
        awaitingPlay = false
        handle?.pause()

        return
      case "cancel":
        token += 1
        awaitingPlay = false
        handle = null
        pendingSeek = null
        audio?.strip.stop()

        return
      case "seek":
        if (handle) handle.seek(effect.to)
        else pendingSeek = effect.to

        return
      default:
        effect satisfies never
    }
  }

  /** Plays the current track on the strip. The strip's status, not this function, reports how it went. */
  function load(): void {
    const track = currentTrack()

    if (!audio || !track) return

    token += 1

    const mine = token

    handle = null
    awaitingPlay = true
    void audio.strip
      .play({
        kind: "file",
        file: env.resolve(track.src),
        loop: intent.settings.repeat === "one",
      })
      .then((result) => {
        if (mine !== token || !result.ok) return

        handle = result.value
        output.loop = null

        if (pendingSeek !== null) {
          handle.seek(pendingSeek)
          pendingSeek = null
        }

        commit()
      })
  }

  /** The strip's and the station's listener, and where tracks advance. */
  function onAudioChange(): void {
    const source = audio?.strip.getStatus() ?? NONE
    const track = currentTrack()

    // Status objects keep their identity until they change, and a feed
    // change calls back with the same status, so this is "the status
    // changed". Set `seen` first: strip.play() below calls back into this
    // listener with "connecting", which must not see this `ended` again.
    if (audio && track && source !== seen) {
      seen = source

      if (
        source.kind !== "connecting" &&
        !(source.kind === "file" && source.playback === "paused")
      )
        awaitingPlay = false

      if (source.kind === "file" && source.duration !== null)
        heard.set(track.id, source.duration)

      if (source.kind === "file" && source.playback === "ended") {
        const plan = planEnded({ playlist, intent })

        adopt(plan.intent)
        // Inside the element's `ended` task, within WebKit's window for a
        // play() without a gesture. A microtask, effect, or timer here
        // risks "blocked".
        apply(plan.effect)
      }
    }

    commit()
  }

  function reconcileLoads(): void {
    const wanted = wantedLoads(
      snapshot,
      {
        durations: needs.durations > 0,
        current: needs.current > 0,
        peaks: needs.peaks > 0,
      },
      failedLoads
    )

    const keys = new Set(wanted.map(loadKey))

    for (const [key, cancel] of running)
      if (!keys.has(key)) {
        cancel()
        running.delete(key)
      }

    const probe = wanted.find((load) => load.kind === "duration")

    const probing = [...running.keys()].some((key) =>
      key.startsWith("duration:")
    )

    // One probe at a time, in priority order.
    if (probe && !probing) start(probe)

    const peaks = wanted.find((load) => load.kind === "peaks")

    if (peaks && !running.has(loadKey(peaks))) start(peaks)
  }

  function start(load: Load): void {
    const key = loadKey(load)
    const at = playlist.indexOf.get(load.id)

    if (at === undefined) return

    const url = env.resolve(playlist.tracks[at].src)
    const controller = new AbortController()
    let stopTimer = () => {}

    const cancel = () => {
      stopTimer()
      controller.abort()
    }

    /** True when this load is still the running one, which it then stops being. */
    const finish = () => {
      stopTimer()

      if (running.get(key) !== cancel) return false

      running.delete(key)

      return true
    }

    running.set(key, cancel)

    if (load.kind === "duration") {
      stopTimer = env.setTimer(() => {
        if (!finish()) return

        controller.abort()
        failedLoads.add(key)
        commit()
      }, PROBE_TIMEOUT_MS)

      void env.probeDuration(url, controller.signal).then((duration) => {
        if (!finish()) return

        if (duration === null) failedLoads.add(key)
        else probed.set(load.id, duration)

        commit()
      })

      return
    }

    void env.decodePeaks(url, controller.signal).then((peaks) => {
      if (!finish()) return

      if (peaks === null) failedLoads.add(key)
      else decoded.set(load.id, peaks)

      commit()
    })
  }

  /**
   * Drops what the store learned about a track that left the list or
   * changed its src. An id that returns, or a new src under an old id, may
   * be a different file, so nothing learned from the old one applies.
   */
  function forget(id: string): void {
    for (const kind of ["duration", "peaks"] as const) {
      const key = loadKey({ kind, id })

      running.get(key)?.()
      running.delete(key)
      failedLoads.delete(key)
    }

    heard.delete(id)
    probed.delete(id)
    decoded.delete(id)
  }

  /** Replaces the scrub, and tells the readouts when what they show changed. */
  function setScrub(next: typeof scrub): void {
    const shown = scrub?.to ?? position

    scrub = next

    if ((scrub?.to ?? position) !== shown)
      for (const listener of positionListeners) listener()
  }

  function sample(): void {
    const next = handle?.position() ?? pendingSeek ?? toSeconds(0)

    if (next === position) return

    position = next

    // Readouts show the scrub's target until it clears.
    if (scrub) return

    for (const listener of positionListeners) listener()
  }

  function syncFrames(): void {
    const wanted =
      positionListeners.size > 0 && snapshot.status.kind === "playing"

    if (wanted && !cancelFrame) cancelFrame = env.frame(tick)

    if (!wanted && cancelFrame) {
      cancelFrame()
      cancelFrame = null
    }
  }

  function tick(): void {
    cancelFrame = null
    sample()
    syncFrames()
  }

  const playhead: Playhead = {
    position: () => scrub?.to ?? position,
    preview(to) {
      const id = currentOf(intent.queue)

      if (id === null || !STATUS_VIEW[snapshot.status.kind].seekable) return

      setScrub({
        id,
        token,
        to: seekTo(to, snapshot.current?.track.duration ?? null),
      })
    },
    commit() {
      const held = scrub

      if (!held) return

      // Cleared before send(): the seek re-enters commit() through the strip.
      setScrub(null)

      if (held.id === currentOf(intent.queue) && held.token === token)
        send({ type: "seek", to: held.to })
    },
    cancel() {
      setScrub(null)
    },
    subscribe(listener) {
      positionListeners.add(listener)
      syncFrames()

      return () => {
        positionListeners.delete(listener)
        syncFrames()
      }
    },
  }

  return {
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    playhead,
    send,
    setTracks(next) {
      const parsed = parsePlaylist(next)

      if (parsed.issues.length > 0 && reported !== parsed.playlist.key)
        env.report(parsed.issues)

      reported = parsed.playlist.key

      if (parsed.playlist.key === playlist.key) return

      const before = new Map(
        playlist.tracks.map((track) => [track.id, track.src])
      )

      const was = currentTrack()

      playlist = parsed.playlist

      for (const [id, src] of before) {
        const at = playlist.indexOf.get(id)

        if (at === undefined || playlist.tracks[at].src !== src) forget(id)
      }

      adopt(reconcilePlaylist(intent, playlist))

      const now = currentTrack()

      // A dropped current track, or a new file under its id, stops playback.
      if (!was || !now || now.id !== was.id || now.src !== was.src)
        apply({ kind: "cancel" })

      commit()
    },
    retain(need) {
      needs[need] += 1
      commit()

      let held = true

      return () => {
        if (!held) return

        held = false
        needs[need] -= 1
        commit()
      }
    },
    release() {
      token += 1
      handle = null
      pendingSeek = null

      for (const cancel of running.values()) cancel()

      running.clear()

      if (audio) {
        audio.unsubscribe()
        audio.strip.close()
        audio = null
      }

      nowPlaying?.clear()
      nowPlaying = null
      seen = NONE
      unsupported = false
      awaitingPlay = false

      if (cancelFrame) {
        cancelFrame()
        cancelFrame = null
      }

      // No reconcileLoads(): a release must not start work. The next
      // retain() or send() reconciles.
      const next = deriveState(inputs(), snapshot)
      const changed = next !== snapshot

      snapshot = next
      setScrub(null)
      sample()

      if (changed) notify()
    },
  }
}
