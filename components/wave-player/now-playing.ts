/*
 * Media Session as one more view of the snapshot. describeNowPlaying()
 * renders the state into a plain description, and the adapter writes only
 * what changed to navigator.mediaSession.
 *
 * The strip opens with `media` unset, so the station never writes Media
 * Session and this adapter is its only writer on the page. The store creates
 * it on the first play, so a silent page never claims the media keys.
 */

import {
  claimMediaSession,
  toSeconds,
  type MediaClaim,
  type Seconds,
} from "@/lib/audio/index"

import type { PlayerCommand, PlayerState } from "./model"
import { STATUS_VIEW } from "./status-view"

/** The part of navigator.mediaSession that Now Playing writes. */
export type NowPlayingSession = Pick<
  MediaSession,
  "metadata" | "playbackState" | "setActionHandler" | "setPositionState"
>

export type NowPlayingView = {
  readonly metadata: {
    readonly title: string
    readonly artist: string
    readonly album: string
  } | null
  readonly playbackState: MediaSessionPlaybackState
  /** Null while the duration is unknown, since setPositionState() throws without one. */
  readonly position: {
    readonly duration: Seconds
    readonly position: Seconds
  } | null
  /** The OS shows a next-track control while Next has a track to play. Its handler and Previous's walk the same queue as the views. */
  readonly next: boolean
}

export function describeNowPlaying(
  state: PlayerState,
  position: Seconds
): NowPlayingView {
  const current = state.current

  if (!current)
    return {
      metadata: null,
      playbackState: "none",
      position: null,
      next: false,
    }

  const duration =
    state.status.kind === "failed" ? null : current.track.duration

  return {
    metadata: {
      title: current.track.title,
      artist: current.track.artist ?? "",
      album: current.track.record ?? "",
    },
    playbackState: STATUS_VIEW[state.status.kind].session,
    position:
      duration === null
        ? null
        : { duration, position: toSeconds(Math.min(position, duration)) },
    next: state.canNext,
  }
}

export type NowPlaying = {
  /** Takes the OS controls for this player. The store calls it on every gesture that starts playback, such as Play, Next, or a Playlist row. */
  claim(): void
  /** Writes the difference from the last view, and the position every time, while this player owns the controls. */
  render(view: NowPlayingView): void
  /** Removes every handler, clears the metadata, and sets the state to "none". */
  clear(): void
}

/**
 * The adapter over navigator.mediaSession, or a no-op without one. Each
 * handler sends an explicit command, so a stray OS "play" never pauses.
 * The store calls render() on every commit, never per frame; the OS
 * advances the position between calls on its own.
 *
 * The page has one set of OS controls, and the player that played last
 * answers them. Every gesture that starts playback claims them through
 * kevelle/audio, and a render writes nothing while another player, such as
 * BinauralBeats, holds a newer claim. Playback that only continues, such as
 * the next track after one ends, never takes them back.
 */
export function createNowPlaying(
  session: NowPlayingSession | null,
  send: (command: PlayerCommand) => void
): NowPlaying {
  if (!session) return { claim: () => {}, render: () => {}, clear: () => {} }

  const handlers: readonly (readonly [
    MediaSessionAction,
    MediaSessionActionHandler,
  ])[] = [
    ["play", () => send({ type: "play" })],
    ["pause", () => send({ type: "pause" })],
    ["previoustrack", () => send({ type: "previous" })],
    [
      "seekto",
      (details) => {
        if (details.seekTime !== undefined)
          send({ type: "seek", to: details.seekTime })
      },
    ],
  ]

  const next: MediaSessionActionHandler = () => send({ type: "next" })
  let shown: NowPlayingView | null = null
  let claim: MediaClaim | null = null
  // The metadata this player wrote, so a revoke clears only its own title.
  let written: MediaMetadata | null = null

  // Browsers throw for an action they do not support.
  function setHandler(
    action: MediaSessionAction,
    handler: MediaSessionActionHandler | null
  ): void {
    try {
      session?.setActionHandler(action, handler)
    } catch {}
  }

  // Browsers throw for a position past the duration, as a seek near the end can briefly report.
  function setPosition(state?: MediaPositionState): void {
    try {
      session?.setPositionState(state)
    } catch {}
  }

  // Runs when another player claims the controls, before it installs its
  // own, so none of this player's actions, such as next track, stay behind.
  function revoke(): void {
    for (const [action] of handlers) setHandler(action, null)

    setHandler("nexttrack", null)
    setPosition()

    if (session?.metadata === written) session.metadata = null

    written = null
    shown = null
  }

  return {
    claim() {
      if (claim?.owns()) return

      claim = claimMediaSession(revoke)
      shown = null
    },
    render(view) {
      // Before its first play, or after another player took the controls,
      // this player leaves them alone.
      if (!claim?.owns()) {
        shown = null

        return
      }

      if (!shown)
        for (const [action, handler] of handlers) setHandler(action, handler)

      const metadata = view.metadata

      if (
        !shown ||
        shown.metadata?.title !== metadata?.title ||
        shown.metadata?.artist !== metadata?.artist ||
        shown.metadata?.album !== metadata?.album
      ) {
        written = metadata ? new MediaMetadata(metadata) : null
        session.metadata = written
      }

      if (shown?.playbackState !== view.playbackState)
        session.playbackState = view.playbackState

      if (!shown || shown.next !== view.next)
        setHandler("nexttrack", view.next ? next : null)

      // With no argument, setPositionState() clears the last track's
      // position, which the OS would otherwise keep showing.
      if (view.position) setPosition({ ...view.position, playbackRate: 1 })
      else if (shown?.position) setPosition()

      shown = view
    },
    clear() {
      const owned = claim?.owns() ?? false

      claim?.release()
      claim = null
      shown = null

      if (!owned) return

      for (const [action] of handlers) setHandler(action, null)

      setHandler("nexttrack", null)
      setPosition()
      session.metadata = null
      session.playbackState = "none"
    },
  }
}
