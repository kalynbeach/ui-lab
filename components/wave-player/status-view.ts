/*
 * What each status looks like and allows, in one table for every view, the
 * screen's hold, the transport rules, and Media Session, so a status never
 * reads differently in two places.
 */

import type {
  FailReason,
  PlayerState,
  StatusKind,
  WavePlayerStatus,
} from "./model"

/** What the screen's figure does. kevelle/waveform's WaveformHold; tools/wave-player/look.test.ts pins the two both ways. */
export type WavePlayerHold = "frozen" | "still"

export type StatusView = {
  /** The center button's glyph. */
  readonly glyph: "play" | "pause" | "retry"
  /** The center button's accessible name. */
  readonly label: "Play" | "Pause" | "Replay" | "Retry"
  /** False after a failure: every time readout shows --:--. Views read timesKnown. */
  readonly times: boolean
  /** A seek applies now, or once the track loads. */
  readonly seekable: boolean
  /** Playback has run for this track, so the block may decode its peaks. */
  readonly started: boolean
  /** Media Session's playbackState. */
  readonly session: MediaSessionPlaybackState
  /**
   * What covers the screen slot: a spinner while the track loads, and after
   * a failure the card's Alert or the mini player's and the bar's warning
   * mark. The slot's content stays mounted under it.
   */
  readonly overlay: "spinner" | "failure" | null
  /**
   * What the screen's figure does, for kevelle/waveform's provider `hold`.
   * Null: it draws the audio. "frozen": it stops where it stands. "still":
   * it draws the current look at rest.
   */
  readonly hold: WavePlayerHold | null
}

export const STATUS_VIEW = {
  idle: {
    glyph: "play",
    label: "Play",
    times: true,
    seekable: true,
    started: false,
    session: "none",
    overlay: null,
    hold: "still",
  },
  loading: {
    glyph: "pause",
    label: "Pause",
    times: true,
    seekable: true,
    started: false,
    session: "playing",
    overlay: "spinner",
    hold: "still",
  },
  playing: {
    glyph: "pause",
    label: "Pause",
    times: true,
    seekable: true,
    started: true,
    session: "playing",
    overlay: null,
    hold: null,
  },
  paused: {
    glyph: "play",
    label: "Play",
    times: true,
    seekable: true,
    started: true,
    session: "paused",
    overlay: null,
    hold: "frozen",
  },
  blocked: {
    glyph: "play",
    label: "Play",
    times: true,
    seekable: true,
    started: false,
    session: "paused",
    overlay: null,
    hold: "frozen",
  },
  ended: {
    glyph: "play",
    label: "Replay",
    times: true,
    seekable: true,
    started: true,
    session: "paused",
    overlay: null,
    hold: "still",
  },
  failed: {
    glyph: "retry",
    label: "Retry",
    times: false,
    seekable: false,
    started: false,
    session: "none",
    overlay: "failure",
    hold: "still",
  },
} as const satisfies Record<StatusKind, StatusView>

/** Whether the views print times. False with no track and after a failure, when every time readout shows --:--. */
export function timesKnown(state: PlayerState): boolean {
  return state.current !== null && STATUS_VIEW[state.status.kind].times
}

/** The card's Alert over a failed track's screen. `retry` turns the transport's center key to Retry where pressing it can help. */
export const FAILURE = {
  load: {
    title: "Couldn't load the track",
    description:
      "The file may be missing, blocked by its host, or in a format this browser can't play.",
    retry: true,
  },
  audio: {
    title: "Audio stopped",
    description: "The page's audio stopped working. Retry starts it again.",
    retry: true,
  },
  unsupported: {
    title: "No Web Audio",
    description: "This browser can't play audio.",
    retry: false,
  },
} as const satisfies Record<
  FailReason,
  {
    readonly title: string
    readonly description: string
    readonly retry: boolean
  }
>

/**
 * The live region's sentence. Loading, playing, and paused share "Now
 * playing <title>.", so pause and resume stay quiet and a track change speaks
 * once. A failure says the track couldn't load and never that it isn't
 * audio, since Chromium reports a 404, a host without CORS, and an
 * undecodable file the same way. Empty when there is nothing to say.
 */
export function announcement(status: WavePlayerStatus): string {
  if (status.kind === "empty") return ""

  const title = status.track.title

  switch (status.kind) {
    case "idle":
      return ""
    case "loading":
    case "playing":
    case "paused":
      return `Now playing ${title}.`
    case "blocked":
      return `Press Play to hear ${title}.`
    case "ended":
      return `Finished ${title}.`
    case "failed":
      switch (status.reason) {
        case "load":
          return `Couldn't load ${title}.`
        case "audio":
          return "Audio stopped working. Press Retry to try again."
        case "unsupported":
          return "This browser can't play audio."
        default:
          return status.reason satisfies never
      }

    default:
      return status satisfies never
  }
}
