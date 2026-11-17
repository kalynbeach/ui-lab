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
 * then owned by this repo, so --check skips them.
 */

import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"

const REGISTRY = "https://registry.kkb.systems/r/kevelle"
const ROOT = join(import.meta.dir, "..", "..")
const MANIFEST = join(import.meta.dir, "manifest.json")

type ItemSpec = {
  readonly item: string
  /** File basenames to take. Omit to take every file of the item. */
  readonly only?: readonly string[]
  readonly seed?: boolean
}

const ITEMS: readonly ItemSpec[] = [
  { item: "audio" },
  { item: "phosphor" },
  { item: "scope" },
  {
    item: "waveform",
    only: ["engine.ts", "figure.ts", "keys.ts", "settings.ts", "waveform.tsx"],
  },
  {
    item: "wave-player",
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

type ManifestFile = {
  item: string
  source: string
  target: string
  sha256: string
  seed: boolean
}
type Manifest = { registry: string; files: ManifestFile[] }

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

function targetOf(file: RegistryFile): string {
  if (!file.target) throw new Error(`${file.path} has no target`)
  return file.target.replace(/^@lib\//, "lib/").replace(/^@components\//, "components/")
}

function rewriteImports(content: string): string {
  let next = content
  for (const [from, to] of IMPORT_REWRITES) next = next.replaceAll(from, to)
  return next
}

async function fetchItem(item: string): Promise<RegistryItem> {
  const response = await fetch(`${REGISTRY}/${item}.json`)
  if (!response.ok) throw new Error(`${item}: registry answered ${response.status}`)
  return (await response.json()) as RegistryItem
}

async function install(withSeeds: boolean): Promise<void> {
  const previous: Manifest | null = (await Bun.file(MANIFEST).exists())
    ? ((await Bun.file(MANIFEST).json()) as Manifest)
    : null
  const files: ManifestFile[] = []

  for (const spec of ITEMS) {
    const seed = spec.seed === true
    if (seed && !withSeeds) {
      files.push(...(previous?.files.filter((file) => file.item === spec.item) ?? []))
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
      const target = targetOf(file)
      const content = rewriteImports(file.content)
      await mkdir(dirname(join(ROOT, target)), { recursive: true })
      await Bun.write(join(ROOT, target), content)
      files.push({ item: spec.item, source: file.path, target, sha256: sha256(content), seed })
    }
    console.log(`${spec.item}: wrote ${wanted.length} files${seed ? " (seed)" : ""}`)
  }

  const manifest: Manifest = { registry: REGISTRY, files }
  await Bun.write(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function check(): Promise<void> {
  const manifest = (await Bun.file(MANIFEST).json()) as Manifest
  const drifted: string[] = []
  for (const file of manifest.files) {
    if (file.seed) continue
    const onDisk = Bun.file(join(ROOT, file.target))
    if (!(await onDisk.exists()) || sha256(await onDisk.text()) !== file.sha256) {
      drifted.push(file.target)
    }
  }
  if (drifted.length) {
    console.error(`Pinned Kevelle files differ from the registry copy:\n${drifted.join("\n")}`)
    process.exit(1)
  }
  const pinned = manifest.files.filter((file) => !file.seed).length
  console.log(`${pinned} pinned Kevelle files match the manifest`)
}

if (process.argv.includes("--check")) await check()
else await install(process.argv.includes("--seed"))
