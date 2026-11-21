"use client"

/*
 * The current track's position, for the parts that draw it.
 *
 * Position is not part of the store's snapshot, which would re-render every
 * view each frame. A part reads it with usePlayhead(playhead, select) and
 * re-renders only when its selected value changes: whole seconds for a time
 * readout, the played-bar count for a seek bar, one device pixel of the
 * mobile bar's progress line.
 *
 * While a track plays, the store samples the file handle once per animation
 * frame and notifies; otherwise it samples on a seek, a track change, or a
 * status change.
 *
 * A scrub previews a seek: while someone drags the seek bar, position()
 * reports the drag's target, so every readout shows it, and the track keeps
 * playing where it is. commit() seeks there once. A scrub belongs to the
 * track and the load it started on; when either changes it is dropped, so a
 * drag that outlives its track never seeks the next one. The bar's Progress indicator also eases between its steps
 * with its CSS width transition, which Kevelle's reduced-motion rule
 * shortens to nothing.
 */

import * as React from "react"

import type { Seconds } from "@/lib/audio/index"

export interface Playhead {
  /** Seconds into the current track at the last sample, or a scrub's target. The same value until the next notification. */
  position(): Seconds
  subscribe(listener: () => void): () => void
  /** Shows `to`, clamped into the track, without seeking. Nothing while the status cannot seek. */
  preview(to: number): void
  /** Seeks once to the previewed target, then clears the scrub. Nothing when no scrub stands. */
  commit(): void
  /** Clears the scrub without seeking. */
  cancel(): void
  /** A scrub stands. False once the store dropped it, as when its track or its load changed. */
  scrubbing(): boolean
}

/** A playhead that holds `position`, for the states workbench and tests. */
export function stillPlayhead(position: Seconds): Playhead {
  return {
    position: () => position,
    subscribe: () => () => {},
    preview() {},
    commit() {},
    cancel() {},
    scrubbing: () => false,
  }
}

/**
 * `select(position)`, re-rendering the caller only when it changes. `select`
 * returns a primitive, so an unchanged value skips the render.
 */
export function usePlayhead<T extends string | number | boolean>(
  playhead: Playhead,
  select: (position: Seconds) => T
): T {
  const read = () => select(playhead.position())

  return React.useSyncExternalStore(playhead.subscribe, read, read)
}
