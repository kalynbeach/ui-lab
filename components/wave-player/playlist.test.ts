import { describe, expect, test } from "vitest"

import { parsePlaylist, type WavePlayerTrack } from "./playlist"

describe("parsePlaylist", () => {
  test("checks a good list, trims text, and fills absent fields with null", () => {
    const { playlist, issues } = parsePlaylist([
      { id: " a ", title: " Low tide ", src: " /a.mp3 ", artist: " Kevelle ", duration: 120 },
      { id: "b", title: "Undertow", src: "https://cdn.test/b.mp3", artist: " ", record: "Tides", tag: "Sample" },
    ])

    expect(issues).toEqual([])
    expect(playlist.tracks).toEqual([
      { id: "a", title: "Low tide", src: "/a.mp3", artist: "Kevelle", record: null, tag: null, duration: 120, peaks: null, look: null },
      { id: "b", title: "Undertow", src: "https://cdn.test/b.mp3", artist: null, record: "Tides", tag: "Sample", duration: null, peaks: null, look: null },
    ])
    expect(playlist.indexOf.get("b")).toBe(1)
  })

  test("drops tracks it cannot play and reports each", () => {
    const { playlist, issues } = parsePlaylist([
      { id: "", title: "No id", src: "/x.mp3" },
      { id: "x", title: " ", src: "/x.mp3" },
      { id: "y", title: "No src", src: "" },
      { id: "a", title: "Low tide", src: "/a.mp3" },
      { id: "a", title: "Again", src: "/again.mp3" },
      { id: "z", title: "Bad src", src: "http://[::1" },
    ])

    expect(playlist.tracks.map((track) => track.title)).toEqual(["Low tide"])
    expect(issues).toEqual([
      { kind: "missing-field", at: 0, field: "id" },
      { kind: "missing-field", at: 1, field: "title" },
      { kind: "missing-field", at: 2, field: "src" },
      { kind: "duplicate-id", at: 4, id: "a" },
      { kind: "bad-src", id: "z" },
    ])
  })

  test("keeps a track with a bad optional field and drops only the field", () => {
    const { playlist, issues } = parsePlaylist([
      { id: "a", title: "A", src: "/a.mp3", duration: -1 },
      { id: "b", title: "B", src: "/b.mp3", duration: Number.NaN },
      { id: "c", title: "C", src: "/c.mp3", peaks: [Number.NaN] },
      { id: "d", title: "D", src: "/d.mp3", look: "dark" as unknown as WavePlayerTrack["look"] },
    ])

    expect(playlist.tracks.map((track) => [track.id, track.duration, track.peaks, track.look])).toEqual([
      ["a", null, null, null],
      ["b", null, null, null],
      ["c", null, null, null],
      ["d", null, null, null],
    ])
    expect(issues).toEqual([
      { kind: "bad-duration", id: "a" },
      { kind: "bad-duration", id: "b" },
      { kind: "bad-peaks", id: "c" },
      { kind: "bad-look", id: "d" },
    ])
  })

  test("clamps peaks into 0 to 1", () => {
    const { playlist } = parsePlaylist([{ id: "a", title: "A", src: "/a.mp3", peaks: [-1, 0.5, 2, Number.POSITIVE_INFINITY] }])

    expect(playlist.tracks[0].peaks).toEqual([0, 0.5, 1])
  })

  test("two lists with the same content share a key", () => {
    const tracks: WavePlayerTrack[] = [{ id: "a", title: "A", src: "/a.mp3" }]

    expect(parsePlaylist(tracks).playlist.key).toBe(parsePlaylist([{ ...tracks[0] }]).playlist.key)
    expect(parsePlaylist(tracks).playlist.key).not.toBe(
      parsePlaylist([{ ...tracks[0], title: "B" }]).playlist.key
    )
  })

  // Stored or fetched JSON can miss a required field whatever the type says.
  test("never throws on a record missing a required field", () => {
    const record = { title: "No id", src: "/x.mp3" } as unknown as WavePlayerTrack

    expect(parsePlaylist([record])).toEqual({
      playlist: { tracks: [], indexOf: new Map(), key: "[]" },
      issues: [{ kind: "missing-field", at: 0, field: "id" }],
    })
  })
})
