import { describe, expect, test } from "vitest"

import {
  auditManifest,
  obsoleteFiles,
  targetOf,
  type ItemSpec,
  type Manifest,
  type ManifestFile,
} from "./vendor"

const audio: ItemSpec = { item: "audio", dir: "lib/audio" }
const waveform: ItemSpec = { item: "waveform", dir: "components/waveform", only: ["engine.ts"] }
const core: ItemSpec = { item: "wave-player", dir: "components/wave-player", seed: true, only: ["model.ts"] }
const specs = [audio, waveform, core]

describe("targetOf", () => {
  test("maps the registry's aliases into the item's directory", () => {
    expect(targetOf(audio, { path: "r/feed.ts", target: "@lib/audio/feed.ts" })).toBe("lib/audio/feed.ts")
    expect(targetOf(waveform, { path: "r/engine.ts", target: "@components/waveform/engine.ts" })).toBe(
      "components/waveform/engine.ts"
    )
  })

  test.each([
    "@lib/../../../escape.ts",
    "@lib/audio/../../escape.ts",
    "@components/../../escape.ts",
    "@lib/screen/feed.ts",
    "/etc/passwd",
    "@lib/audio\\..\\..\\escape.ts",
  ])("refuses %s", (target) => {
    expect(() => targetOf(audio, { path: "r/feed.ts", target })).toThrow(/refusing target/)
  })

  test("refuses a file with no target", () => {
    expect(() => targetOf(audio, { path: "r/feed.ts" })).toThrow(/no target/)
  })
})

describe("obsoleteFiles", () => {
  const row = (item: string, target: string, seed = false): ManifestFile => ({
    item,
    source: `r/${target}`,
    target,
    sha256: "0",
    seed,
  })
  const previous = [
    row("audio", "lib/audio/feed.ts"),
    row("audio", "lib/audio/gone.ts"),
    row("waveform", "components/waveform/engine.ts"),
    row("phosphor", "lib/phosphor/index.ts"),
    row("wave-player", "components/wave-player/model.ts", true),
  ]
  const written = new Set(["lib/audio/feed.ts"])
  const refreshed = new Set(["audio"])

  test("removes a pinned file the registry stopped serving, and leaves an item that was not refreshed", () => {
    expect(obsoleteFiles(previous, written, refreshed, [...specs, { item: "phosphor", dir: "lib/phosphor" }])).toEqual([
      "lib/audio/gone.ts",
    ])
  })

  test("removes every pinned file of an item that left the list", () => {
    expect(obsoleteFiles(previous, written, refreshed, specs)).toEqual(["lib/audio/gone.ts", "lib/phosphor/index.ts"])
  })

  test("never removes a seed file, even when its item left the list", () => {
    expect(obsoleteFiles(previous, written, refreshed, [audio, waveform])).not.toContain(
      "components/wave-player/model.ts"
    )
  })
})

describe("auditManifest", () => {
  const manifest: Manifest = {
    registry: "https://example.test",
    files: [
      { item: "audio", source: "r/feed.ts", target: "lib/audio/feed.ts", sha256: "aaa", seed: false },
      { item: "waveform", source: "r/engine.ts", target: "components/waveform/engine.ts", sha256: "bbb", seed: false },
      { item: "wave-player", source: "r/model.ts", target: "components/wave-player/model.ts", sha256: "ccc", seed: true },
    ],
  }
  const hashes: Record<string, string> = {
    "lib/audio/feed.ts": "aaa",
    "components/waveform/engine.ts": "bbb",
    "components/wave-player/model.ts": "edited since",
  }
  const disk = {
    listing: {
      audio: ["lib/audio/feed.ts"],
      waveform: ["components/waveform/engine.ts", "components/waveform/waveform.test.tsx"],
      "wave-player": ["components/wave-player/model.ts", "components/wave-player/queue.ts"],
    },
    hashOf: (target: string) => hashes[target] ?? null,
  }

  test("passes when pinned files match, and ignores tests and edited seed files", () => {
    expect(auditManifest(manifest, disk, specs)).toEqual([])
  })

  test("reports a pinned file whose content changed", () => {
    const drifted = { ...disk, hashOf: (target: string) => (target === "lib/audio/feed.ts" ? "zzz" : disk.hashOf(target)) }
    expect(auditManifest(manifest, drifted, specs)).toEqual([
      "lib/audio/feed.ts: differs from the registry copy, or is missing",
    ])
  })

  test("reports a pinned file that is gone", () => {
    const gone = { ...disk, hashOf: (target: string) => (target === "lib/audio/feed.ts" ? null : disk.hashOf(target)) }
    expect(auditManifest(manifest, gone, specs)).toContain(
      "lib/audio/feed.ts: differs from the registry copy, or is missing"
    )
  })

  test("reports a pinned file whose manifest row was removed", () => {
    const pruned = { ...manifest, files: manifest.files.filter((file) => file.target !== "lib/audio/feed.ts") }
    expect(auditManifest(pruned, disk, specs)).toEqual(["lib/audio/feed.ts: on disk but not in the manifest"])
  })

  test("reports a named pinned file that has no row and no file", () => {
    const pruned = { ...manifest, files: manifest.files.filter((file) => file.item !== "waveform") }
    const emptied = { ...disk, listing: { ...disk.listing, waveform: [] } }
    expect(auditManifest(pruned, emptied, specs)).toEqual(["components/waveform/engine.ts: not in the manifest"])
  })

  test("reports a pinned row re-marked as seed", () => {
    const remarked = {
      ...manifest,
      files: manifest.files.map((file) => (file.item === "audio" ? { ...file, seed: true } : file)),
    }
    expect(auditManifest(remarked, disk, specs)).toEqual([
      "lib/audio/feed.ts: manifest marks it seed, the item is not",
    ])
  })

  test("reports an unlisted file in a pinned directory", () => {
    const extra = { ...disk, listing: { ...disk.listing, audio: ["lib/audio/feed.ts", "lib/audio/extra.ts"] } }
    expect(auditManifest(manifest, extra, specs)).toEqual(["lib/audio/extra.ts: on disk but not in the manifest"])
  })

  test("reports a row that points outside its item's directory", () => {
    const moved = {
      ...manifest,
      files: [...manifest.files, { item: "audio", source: "r/x.ts", target: "lib/scope/x.ts", sha256: "ddd", seed: false }],
    }
    expect(auditManifest(moved, { ...disk, hashOf: (target: string) => (target === "lib/scope/x.ts" ? "ddd" : disk.hashOf(target)) }, specs)).toEqual([
      "lib/scope/x.ts: outside lib/audio/",
    ])
  })
})
