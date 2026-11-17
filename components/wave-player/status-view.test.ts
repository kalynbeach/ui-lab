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

describe("STATUS_VIEW", () => {
  test.each<[StatusKind, WavePlayerHold | null]>([
    ["idle", "still"],
    ["loading", "still"],
    ["playing", null],
    ["paused", "frozen"],
    ["blocked", "frozen"],
    ["ended", "still"],
    ["failed", "still"],
  ])("%s holds the screen as %s", (kind, hold) => {
    expect(STATUS_VIEW[kind].hold).toBe(hold)
  })

  test.each<[StatusKind, string, string]>([
    ["idle", "play", "Play"],
    ["loading", "pause", "Pause"],
    ["playing", "pause", "Pause"],
    ["paused", "play", "Play"],
    ["blocked", "play", "Play"],
    ["ended", "play", "Replay"],
    ["failed", "retry", "Retry"],
  ])("%s shows the %s glyph named %s", (kind, glyph, label) => {
    expect(STATUS_VIEW[kind].glyph).toBe(glyph)
    expect(STATUS_VIEW[kind].label).toBe(label)
  })

  test.each<[StatusKind, string | null, string | null]>([
    ["idle", null, null],
    ["loading", "LOADING", "spinner"],
    ["playing", null, null],
    ["paused", null, null],
    ["blocked", "HOLD", null],
    ["ended", "ENDED", null],
    ["failed", "FAULT", "failure"],
  ])("%s shows badge %s and overlay %s", (kind, badge, overlay) => {
    expect(STATUS_VIEW[kind].badge?.label ?? null).toBe(badge)
    expect(STATUS_VIEW[kind].overlay).toBe(overlay)
  })

  test("only a failed track hides its times and refuses a seek", () => {
    const blocked = Object.entries(STATUS_VIEW)
      .filter(([, view]) => !view.times || !view.seekable)
      .map(([kind]) => kind)
    expect(blocked).toEqual(["failed"])
  })

  test.each<[StatusKind, MediaSessionPlaybackState]>([
    ["idle", "none"],
    ["loading", "playing"],
    ["playing", "playing"],
    ["paused", "paused"],
    ["blocked", "paused"],
    ["ended", "paused"],
    ["failed", "none"],
  ])("%s reports Media Session state %s", (kind, session) => {
    expect(STATUS_VIEW[kind].session).toBe(session)
  })
})
