/*
 * The two background loads the store runs for tracks the site gave no
 * duration or peaks. Both take an AbortSignal and resolve to null on any
 * failure, abort included, so a load never rejects. The store times probes
 * out and caches a null per track, so a broken URL is asked for once.
 *
 * For a site track, both request the file the way the playing element does,
 * CORS with same-origin credentials, so the browser can answer them from one
 * cache entry. A person's File is read where it is: the probe through an
 * object URL it revokes when it finishes, the decode from its bytes.
 */

import { toSeconds, type Seconds } from "@/lib/audio/index"

import { PEAK_RESOLUTION, reducePeaks, type Peaks } from "./peaks"

/**
 * Sample rates the peaks decode tries, lowest first. An overview needs
 * little bandwidth, and 8 kHz keeps a five-minute stereo decode near 19 MB
 * instead of 106 MB at 44.1 kHz. A browser that refuses a rate gets the
 * next one.
 */
const DECODE_RATES = [8000, 22050, 44100] as const

/**
 * A track's duration from its metadata, through a detached element that
 * never plays and never joins the audio graph.
 */
export function probeDuration(
  media: File | URL,
  signal: AbortSignal
): Promise<Seconds | null> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(null)

      return
    }

    const element = new Audio()
    const src = media instanceof URL ? media.href : URL.createObjectURL(media)

    const finish = (value: Seconds | null) => {
      element.removeEventListener("loadedmetadata", loaded)
      element.removeEventListener("error", failed)
      signal.removeEventListener("abort", failed)
      // Dropping src and loading again closes the element's connection.
      element.removeAttribute("src")
      element.load()

      if (!(media instanceof URL)) URL.revokeObjectURL(src)

      resolve(value)
    }

    const loaded = () =>
      finish(
        Number.isFinite(element.duration) && element.duration > 0
          ? toSeconds(element.duration)
          : null
      )

    const failed = () => finish(null)

    element.preload = "metadata"
    element.crossOrigin = "anonymous"
    element.addEventListener("loadedmetadata", loaded)
    element.addEventListener("error", failed)
    signal.addEventListener("abort", failed)
    element.src = src
  })
}

/**
 * A track's peaks: fetch the whole file, decode it at a low rate on an
 * OfflineAudioContext that only decodes, and reduce it to PEAK_RESOLUTION
 * values. Each attempt decodes a fresh copy, because decodeAudioData()
 * detaches the buffer it reads.
 */
export async function decodePeaks(
  media: File | URL,
  signal: AbortSignal
): Promise<Peaks | null> {
  try {
    const bytes = await read(media, signal)

    if (!bytes || signal.aborted) return null

    for (const sampleRate of DECODE_RATES) {
      let context: OfflineAudioContext

      try {
        context = new OfflineAudioContext({
          numberOfChannels: 1,
          length: 1,
          sampleRate,
        })
      } catch {
        continue
      }

      const buffer = await context.decodeAudioData(bytes.slice(0))

      if (signal.aborted) return null

      return reducePeaks(
        Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
          buffer.getChannelData(channel)
        ),
        PEAK_RESOLUTION
      )
    }

    return null
  } catch {
    return null
  }
}

async function read(
  media: File | URL,
  signal: AbortSignal
): Promise<ArrayBuffer | null> {
  if (!(media instanceof URL)) return media.arrayBuffer()

  const response = await fetch(media, {
    signal,
    mode: "cors",
    credentials: "same-origin",
  })

  return response.ok ? response.arrayBuffer() : null
}
