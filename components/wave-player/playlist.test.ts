import { describe, expect, test } from "vitest"

import { joinPlaylist, parseFiles, parsePlaylist, type WavePlayerTrack } from "./playlist"

describe("parsePlaylist", () => {
  test("checks a good list, trims text, and fills absent fields with null", () => {
    const { playlist, issues } = parsePlaylist([
      { id: " a ", title: " Low tide ", src: " /a.mp3 ", artist: " Kevelle ", duration: 120 },
      { id: "b", title: "Undertow", src: "https://cdn.test/b.mp3", artist: " ", record: "Tides", tag: "Sample" },
    ])

    expect(issues).toEqual([])
    expect(playlist.tracks).toEqual([
      { id: "a", title: "Low tide", source: { kind: "site", src: "/a.mp3" }, artist: "Kevelle", record: null, tag: null, duration: 120, peaks: null, look: null },
      { id: "b", title: "Undertow", source: { kind: "site", src: "https://cdn.test/b.mp3" }, artist: null, record: "Tides", tag: "Sample", duration: null, peaks: null, look: null },
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
      { id: "file:1", title: "Reserved", src: "/r.mp3" },
    ])

    expect(playlist.tracks.map((track) => track.title)).toEqual(["Low tide"])
    expect(issues).toEqual([
      { kind: "missing-field", at: 0, field: "id" },
      { kind: "missing-field", at: 1, field: "title" },
      { kind: "missing-field", at: 2, field: "src" },
      { kind: "duplicate-id", at: 4, id: "a" },
      { kind: "bad-src", id: "z" },
      { kind: "reserved-id", at: 6, id: "file:1" },
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

describe("parseFiles", () => {
  const file = (name: string, type: string) => new File(["x"], name, { type })

  test("accepts what the strip plays: an audio type, or a known audio extension", () => {
    const { tracks, issues } = parseFiles(
      [
        file("Low tide.mp3", "audio/mpeg"),
        file("take", "audio/wav"),
        file("Shoal.FLAC", ""),
        file("notes.txt", "text/plain"),
        file("demo", ""),
      ],
      0
    )

    expect(tracks.map((track) => [track.id, track.title, track.source.kind])).toEqual([
      ["file:0", "Low tide", "file"],
      ["file:1", "take", "file"],
      ["file:2", "Shoal", "file"],
    ])
    expect(issues).toEqual([
      { kind: "unsupported-file", name: "notes.txt" },
      { kind: "unsupported-file", name: "demo" },
    ])
  })

  test("numbers ids from where the last call stopped", () => {
    expect(parseFiles([file("a.mp3", "audio/mpeg")], 4).tracks[0].id).toBe("file:4")
  })

  test("a joined playlist lists the files after the site's tracks, and its key names them", () => {
    const site = parsePlaylist([{ id: "a", title: "A", src: "/a.mp3" }]).playlist
    const files = parseFiles([file("b.mp3", "audio/mpeg"), file("c.mp3", "audio/mpeg")], 0).tracks
    const joined = joinPlaylist(site, files)

    expect(joined.tracks.map((track) => track.id)).toEqual(["a", "file:0", "file:1"])
    expect(joined.indexOf.get("file:1")).toBe(2)
    expect(joined.key).not.toBe(joinPlaylist(site, files.slice(0, 1)).key)
  })
})
