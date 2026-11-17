/// <reference types="bun" />
/*
 * Installs Kevelle items from the public registry at registry.kkb.systems.
 *
 *   bun tools/kevelle/vendor.ts            fetch every pinned item and rewrite the manifest
 *   bun tools/kevelle/vendor.ts --seed     also write the seed files (once; they are edited afterwards)
 *   bun tools/kevelle/vendor.ts --check    verify pinned files on disk against the manifest, no network
 *
 * Files are written as the registry serves them. The only edit is the import
 * rewrite the shadcn CLI also makes, from the registry's own paths to this
 * app's aliases. Pinned files must stay byte-identical to that output, and
 * --check fails when one drifts. Seed files start as registry copies and are
 * then owned by this repo, so --check skips their content.
 */

import { createHash } from "node:crypto"
import { mkdir, readdir, unlink } from "node:fs/promises"
import { dirname, join, posix } from "node:path"
import { fileURLToPath } from "node:url"

const REGISTRY = "https://registry.kkb.systems/r/kevelle"
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..", "..")
const MANIFEST = join(HERE, "manifest.json")

export type ItemSpec = {
  readonly item: string
  /** The one directory this item may write into, relative to the repo root. */
  readonly dir: string
  /** File basenames to take. Omit to take every file of the item. */
  readonly only?: readonly string[]
  readonly seed?: boolean
}

export const ITEMS: readonly ItemSpec[] = [
  { item: "audio", dir: "lib/audio" },
  { item: "phosphor", dir: "lib/phosphor" },
  { item: "scope", dir: "lib/scope" },
  {
    item: "waveform",
    dir: "components/waveform",
    only: ["engine.ts", "figure.ts", "keys.ts", "settings.ts", "waveform.tsx"],
  },
  {
    item: "wave-player",
    dir: "components/wave-player",
    seed: true,
    only: [
      "dock.ts",
      "format.ts",
      "keys.ts",
      "loaders.ts",
      "look.ts",
      "model.ts",
      "morph.ts",
      "now-playing.ts",
      "peaks.ts",
      "playhead.ts",
      "playlist.ts",
      "status-view.ts",
      "store.ts",
    ],
  },
]

const IMPORT_REWRITES: readonly (readonly [string, string])[] = [
  ["@/registry/kevelle/lib/", "@/lib/"],
  ["@/registry/kevelle/ui/", "@/components/ui/"],
  ["@/registry/kevelle/blocks/", "@/components/"],
]

type RegistryFile = { path: string; target?: string; content: string }
type RegistryItem = { name: string; files: RegistryFile[] }

export type ManifestFile = {
  item: string
  source: string
  target: string
  sha256: string
  seed: boolean
}
export type Manifest = { registry: string; files: ManifestFile[] }

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

const isTest = (path: string) => /\.test\.tsx?$/.test(path)

/**
 * Where a registry file lands. The registry's target is data from the network,
 * so anything that resolves outside the item's own directory is refused.
 */
export function targetOf(spec: ItemSpec, file: Pick<RegistryFile, "path" | "target">): string {
  if (!file.target) throw new Error(`${file.path} has no target`)
  const mapped = file.target.replace(/^@lib\//, "lib/").replace(/^@components\//, "components/")
  const target = posix.normalize(mapped)
  if (mapped.includes("\\") || !target.startsWith(`${spec.dir}/`)) {
    throw new Error(`${spec.item}: refusing target ${file.target}, outside ${spec.dir}/`)
  }
  return target
}

function rewriteImports(content: string): string {
  let next = content
  for (const [from, to] of IMPORT_REWRITES) next = next.replaceAll(from, to)
  return next
}

/**
 * Every way the manifest and the disk can disagree about pinned files. A
 * check of manifest rows alone passes when a row is deleted or re-marked as
 * seed, so membership is checked against the specs and the directories too.
 */
export function auditManifest(
  manifest: Manifest,
  disk: {
    /** Repo-relative paths of the files in each item's directory. */
    readonly listing: Readonly<Record<string, readonly string[]>>
    /** The sha256 of a file's content, or null when it is missing. */
    readonly hashOf: (target: string) => string | null
  },
  specs: readonly ItemSpec[] = ITEMS
): string[] {
  const problems: string[] = []
  const listed = new Set(manifest.files.map((file) => file.target))

  for (const file of manifest.files) {
    const spec = specs.find((candidate) => candidate.item === file.item)
    if (!spec) {
      problems.push(`${file.target}: manifest names an unknown item, ${file.item}`)
      continue
    }
    if (!file.target.startsWith(`${spec.dir}/`)) {
      problems.push(`${file.target}: outside ${spec.dir}/`)
    }
    if (file.seed !== (spec.seed === true)) {
      problems.push(`${file.target}: manifest marks it ${file.seed ? "seed" : "pinned"}, the item is not`)
    }
    if (!file.seed && disk.hashOf(file.target) !== file.sha256) {
      problems.push(`${file.target}: differs from the registry copy, or is missing`)
    }
  }

  for (const spec of specs) {
    if (spec.seed) continue
    for (const name of spec.only ?? []) {
      if (!listed.has(`${spec.dir}/${name}`)) problems.push(`${spec.dir}/${name}: not in the manifest`)
    }
    for (const path of disk.listing[spec.item] ?? []) {
      if (!isTest(path) && !listed.has(path)) problems.push(`${path}: on disk but not in the manifest`)
    }
  }

  return problems
}

async function fetchItem(item: string): Promise<RegistryItem> {
  const response = await fetch(`${REGISTRY}/${item}.json`)
  if (!response.ok) throw new Error(`${item}: registry answered ${response.status}`)
  return (await response.json()) as RegistryItem
}

async function readManifest(): Promise<Manifest | null> {
  return (await Bun.file(MANIFEST).exists()) ? ((await Bun.file(MANIFEST).json()) as Manifest) : null
}

async function install(withSeeds: boolean): Promise<void> {
  const previous = await readManifest()
  const kept: ManifestFile[] = []
  const writes: { readonly entry: ManifestFile; readonly content: string }[] = []

  // Plan and validate every write before the first one, so a bad target stops the run with nothing changed.
  for (const spec of ITEMS) {
    const seed = spec.seed === true
    if (seed && !withSeeds) {
      kept.push(...(previous?.files.filter((file) => file.item === spec.item) ?? []))
      continue
    }
    const item = await fetchItem(spec.item)
    const wanted = item.files.filter(
      (file) => !spec.only || spec.only.includes(file.path.split("/").at(-1)!)
    )
    const missing = spec.only?.filter(
      (name) => !wanted.some((file) => file.path.endsWith(`/${name}`))
    )
    if (missing?.length) throw new Error(`${spec.item}: registry has no ${missing.join(", ")}`)

    for (const file of wanted) {
      const content = rewriteImports(file.content)
      writes.push({
        entry: {
          item: spec.item,
          source: file.path,
          target: targetOf(spec, file),
          sha256: sha256(content),
          seed,
        },
        content,
      })
    }
  }

  for (const { entry, content } of writes) {
    await mkdir(dirname(join(ROOT, entry.target)), { recursive: true })
    await Bun.write(join(ROOT, entry.target), content)
  }

  // A pinned file the registry stopped serving would stay importable and unchecked, so it goes.
  const written = new Set(writes.map(({ entry }) => entry.target))
  const refreshed = new Set(writes.map(({ entry }) => entry.item))
  for (const file of previous?.files ?? []) {
    if (file.seed || !refreshed.has(file.item) || written.has(file.target)) continue
    await unlink(join(ROOT, file.target)).catch(() => {})
    console.log(`removed ${file.target}, no longer in the registry`)
  }

  const manifest: Manifest = { registry: REGISTRY, files: [...writes.map(({ entry }) => entry), ...kept] }
  manifest.files.sort((a, b) => a.target.localeCompare(b.target))
  await Bun.write(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`wrote ${writes.length} files, kept ${kept.length} seed entries`)
}

async function check(): Promise<void> {
  const manifest = await readManifest()
  if (!manifest) {
    console.error("tools/kevelle/manifest.json is missing")
    process.exit(1)
  }

  const listing: Record<string, string[]> = {}
  for (const spec of ITEMS) {
    const names = await readdir(join(ROOT, spec.dir), { recursive: true, withFileTypes: true }).catch(() => [])
    listing[spec.item] = names
      .filter((entry) => entry.isFile())
      .map((entry) => posix.join(spec.dir, posix.relative(join(ROOT, spec.dir), join(entry.parentPath, entry.name))))
  }

  const hashes = new Map<string, string | null>()
  for (const file of manifest.files) {
    const onDisk = Bun.file(join(ROOT, file.target))
    hashes.set(file.target, (await onDisk.exists()) ? sha256(await onDisk.text()) : null)
  }

  const problems = auditManifest(manifest, { listing, hashOf: (target) => hashes.get(target) ?? null })
  if (problems.length) {
    console.error(`Pinned Kevelle files do not match the manifest:\n${problems.join("\n")}`)
    process.exit(1)
  }
  const pinned = manifest.files.filter((file) => !file.seed).length
  console.log(`${pinned} pinned Kevelle files match the manifest`)
}

if (import.meta.main) {
  if (process.argv.includes("--check")) await check()
  else await install(process.argv.includes("--seed"))
}
