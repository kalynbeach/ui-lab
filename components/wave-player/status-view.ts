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
  /** The Play toggle's glyph. */
  readonly glyph: "play" | "pause" | "retry"
  /**
   * The Play toggle is pressed. Its name stays "Play" in every status, so a
   * person or an agent finds the same control; pressed says it is playing.
   */
  readonly pressed: boolean
  /** What pressing Play does when that differs from starting playback. The toggle's accessible description. */
  readonly description: string | null
  /** False after a failure: every time readout shows --:--. Views read timesKnown. */
  readonly times: boolean
  /** A seek applies now, or once the track loads. */
  readonly seekable: boolean
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
    pressed: false,
    description: null,
    times: true,
    seekable: true,
    session: "none",
    overlay: null,
    hold: "still",
  },
  loading: {
    glyph: "pause",
    pressed: true,
    description: null,
    times: true,
    seekable: true,
    session: "playing",
    overlay: "spinner",
    hold: "still",
  },
  playing: {
    glyph: "pause",
    pressed: true,
    description: null,
    times: true,
    seekable: true,
    session: "playing",
    overlay: null,
    hold: null,
  },
  paused: {
    glyph: "play",
    pressed: false,
    description: null,
    times: true,
    seekable: true,
    session: "paused",
    overlay: null,
    hold: "frozen",
  },
  blocked: {
    glyph: "play",
    pressed: false,
    description: null,
    times: true,
    seekable: true,
    session: "paused",
    overlay: null,
    hold: "frozen",
  },
  ended: {
    glyph: "play",
    pressed: false,
    description: "Plays the track again from the start.",
    times: true,
    seekable: true,
    session: "paused",
    overlay: null,
    hold: "still",
  },
  failed: {
    glyph: "retry",
    pressed: false,
    description: "Tries again.",
    times: false,
    seekable: false,
    session: "none",
    overlay: "failure",
    hold: "still",
  },
} as const satisfies Record<StatusKind, StatusView>

/** Whether the views print times. False with no track and after a failure, when every time readout shows --:--. */
export function timesKnown(state: PlayerState): boolean {
  return state.current !== null && STATUS_VIEW[state.status.kind].times
}

/** The Alert over a failed track's screen. `retry`: pressing Play can help. */
export const FAILURE = {
  load: {
    title: "Couldn't load the track",
    description:
      "The file may be missing, blocked by its host, or in a format this browser can't play.",
    retry: true,
  },
  audio: {
    title: "Audio stopped",
    description: "The page's audio stopped working. Play starts it again.",
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
          return "Audio stopped working. Press Play to try again."
        case "unsupported":
          return "This browser can't play audio."
        default:
          return status.reason satisfies never
      }

    default:
      return status satisfies never
  }
}
