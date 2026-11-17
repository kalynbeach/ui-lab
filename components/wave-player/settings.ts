/*
 * The listener's settings. They hold with no tracks, so a player restores
 * them before its first track arrives.
 */

export type Repeat = "off" | "all" | "one"

export type TimeMode = "elapsed" | "remaining"

export type Settings = {
  /** 0 to 1. The strip squares it under the player's ceiling. */
  readonly level: number
  /** The strip's output is off. The waveform's tap keeps running. */
  readonly muted: boolean
  readonly shuffle: boolean
  readonly repeat: Repeat
  /** What the time readout counts. */
  readonly time: TimeMode
}

export const DEFAULT_SETTINGS: Settings = {
  level: 1,
  muted: false,
  shuffle: false,
  repeat: "off",
  time: "elapsed",
}
