import { describe, expect, expectTypeOf, test } from "vitest"

import type { WaveformHold } from "@/components/waveform/waveform"

import type { StatusKind, WavePlayerStatus, WavePlayerTrackInfo } from "./model"
import { announcement, STATUS_VIEW, type WavePlayerHold } from "./status-view"

const track: WavePlayerTrackInfo = {
  id: "a",
  title: "Low tide",
  artist: null,
  record: null,
  index: 0,
  count: 3,
}

function status(kind: Exclude<StatusKind, "failed">): WavePlayerStatus {
  return { kind, track }
}

describe("announcement", () => {
  test("loading, playing, and paused share one sentence, so pause and resume stay quiet", () => {
    expect(announcement(status("loading"))).toBe("Now playing Low tide")
    expect(announcement(status("playing"))).toBe("Now playing Low tide")
    expect(announcement(status("paused"))).toBe("Now playing Low tide")
  })

  test("says nothing with no tracks or before the first play", () => {
    expect(announcement({ kind: "empty" })).toBe("")
    expect(announcement(status("idle"))).toBe("")
  })

  test.each<[WavePlayerStatus, string]>([
    [status("blocked"), "Press Play to hear Low tide."],
    [status("ended"), "Finished Low tide."],
    [{ kind: "failed", reason: "load", track }, "Couldn't load Low tide."],
    [{ kind: "failed", reason: "audio", track }, "Audio stopped working. Press Retry to try again."],
    [{ kind: "failed", reason: "unsupported", track }, "This browser can't play audio."],
  ])("%o says %s", (given, expected) => {
    expect(announcement(given)).toBe(expected)
  })
})

test("the player's holds are the waveform's holds, both ways", () => {
  expectTypeOf<WavePlayerHold>().toEqualTypeOf<WaveformHold>()

  const holds = new Set(Object.values(STATUS_VIEW).map((view) => view.hold))
  expect(holds).toEqual(new Set([null, "frozen", "still"]))
})
