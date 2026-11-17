/*
 * The track list: what a site passes, and the checked playlist the store
 * trusts. This file is the only reader of raw track input.
 *
 * parsePlaylist() never throws. The provider sits in a site's root layout,
 * so one bad record must not take the site down. It drops a track it cannot
 * play (no id, no title, no src, a repeated id), drops a bad optional field
 * (a duration that is not a positive number, peaks with nothing finite, a
 * look that is not an object), clamps peaks into 0 to 1, and
 * returns every issue for the store to report.
 *
 * `src` stays a string. The store resolves it against the page when it
 * plays, so parsing stays pure, and the server and the client parse one
 * list to the same playlist.
 */

import { toSeconds, type Seconds } from "@/lib/audio/index"

import { checkLook, type WavePlayerLook } from "./look"
import { toPeaks, type Peaks } from "./peaks"

/** One track as a site passes it. */
export type WavePlayerTrack = {
  /** Stable and unique within the list. The current track and the caches follow it. */
  readonly id: string
  readonly title: string
  /**
   * An absolute or page-relative URL. A cross-origin host must send
   * Access-Control-Allow-Origin, or the track fails to load.
   */
  readonly src: string
  readonly artist?: string
  /** The album, shown after the artist and sent to Media Session as the album. */
  readonly record?: string
  /** The card's short label, such as "Sample". */
  readonly tag?: string
  /** Seconds, when known ahead. Saves a metadata request per track. */
  readonly duration?: number
  /** An amplitude overview, 0 to 1, any length. Saves a download and a decode. */
  readonly peaks?: readonly number[]
  /** The track's waveform look. Absent or null: the block's default player look. */
  readonly look?: WavePlayerLook | null
}

declare const trackId: unique symbol

/** A track id that a checked playlist issued. Only parsePlaylist() makes one. */
export type TrackId = string & { readonly [trackId]: true }

/** A checked track. Optional fields are null, never undefined. */
export type Track = {
  readonly id: TrackId
  readonly title: string
  readonly src: string
  readonly artist: string | null
  readonly record: string | null
  readonly tag: string | null
  readonly duration: Seconds | null
  readonly peaks: Peaks | null
  /** The site's look object, checked. */
  readonly look: WavePlayerLook | null
}

export type Playlist = {
  readonly tracks: readonly Track[]
  /** Each id's position, so a row click is one lookup. */
  readonly indexOf: ReadonlyMap<string, number>
  /** The content. Two playlists with one key are the same list, so a fresh array of the same tracks changes nothing. */
  readonly key: string
}

export type PlaylistIssue =
  | {
      readonly kind: "missing-field"
      /** The record's position in the input. */
      readonly at: number
      readonly field: "id" | "title" | "src"
    }
  | { readonly kind: "duplicate-id"; readonly at: number; readonly id: string }
  | { readonly kind: "bad-src"; readonly id: string }
  | { readonly kind: "bad-duration"; readonly id: string }
  | { readonly kind: "bad-peaks"; readonly id: string }
  | { readonly kind: "bad-look"; readonly id: string }

/** A fixed base, so the server and the client accept the same src strings. */
const PARSE_BASE = "https://wave-player.invalid/"

export type ParsedPlaylist = {
  readonly playlist: Playlist
  readonly issues: readonly PlaylistIssue[]
}

export function parsePlaylist(
  input: readonly WavePlayerTrack[]
): ParsedPlaylist {
  const tracks: Track[] = []
  const indexOf = new Map<string, number>()
  const issues: PlaylistIssue[] = []

  input.forEach((record, at) => {
    // SAFETY: a checked id is a TrackId; the checks below drop every other record.
    const id = text(record.id) as TrackId
    const title = text(record.title)
    const src = text(record.src)

    const missing =
      id === "" ? "id" : title === "" ? "title" : src === "" ? "src" : null

    if (missing) {
      issues.push({ kind: "missing-field", at, field: missing })

      return
    }

    if (indexOf.has(id)) {
      issues.push({ kind: "duplicate-id", at, id })

      return
    }

    if (!URL.canParse(src, PARSE_BASE)) {
      issues.push({ kind: "bad-src", id })

      return
    }

    const duration =
      record.duration !== undefined &&
      Number.isFinite(record.duration) &&
      record.duration > 0
        ? toSeconds(record.duration)
        : null

    if (record.duration !== undefined && duration === null)
      issues.push({ kind: "bad-duration", id })

    const peaks = record.peaks === undefined ? null : toPeaks(record.peaks)

    if (record.peaks !== undefined && peaks === null)
      issues.push({ kind: "bad-peaks", id })

    const given = record.look ?? null
    const look = given === null ? null : checkLook(given)

    if (given !== null && look === null) issues.push({ kind: "bad-look", id })

    indexOf.set(id, tracks.length)
    tracks.push({
      id,
      title,
      src,
      artist: text(record.artist) || null,
      record: text(record.record) || null,
      tag: text(record.tag) || null,
      duration,
      peaks,
      look,
    })
  })

  return {
    playlist: { tracks, indexOf, key: JSON.stringify(tracks) },
    issues,
  }
}

/** Trimmed text, or "" for anything that is not a string. Stored or fetched JSON can hold any value whatever the type says. */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
