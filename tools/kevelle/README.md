# Kevelle libs

`vendor.ts` installs Kevelle code from Kalyn's own registry at `https://registry.kkb.systems/r/kevelle`. Each item is a JSON file that lists its source files. The script writes each file to its target in this repo and rewrites its imports from registry paths (`@/registry/kevelle/lib/`, `/ui/`, `/blocks/`) to this app's paths (`@/lib/`, `@/components/ui/`, `@/components/`). It changes nothing else. It refuses a registry target that resolves outside the item's own directory, and it validates every target before it writes the first file.

| Item | Target | Kind |
| --- | --- | --- |
| `audio` | `lib/audio/` | pinned |
| `phosphor` | `lib/phosphor/` | pinned |
| `scope` | `lib/scope/` | pinned |
| `waveform` | `components/waveform/` (5 of its files) | pinned |
| `wave-player` | `components/wave-player/` (13 core `.ts` files) | seed |

`manifest.json` records every file the script wrote, with its registry path and the SHA-256 of what it wrote.

## Pinned and seed files

A pinned file stays byte-identical to the registry copy. Don't edit it. To change one, change it in the registry and install again.

A seed file starts as a registry copy and then belongs to this repo. Edit it like any other source file. The script never writes a seed file again unless you pass `--seed`.

`components/waveform/waveform.tsx` imports four ui parts this repo builds on UI SDK: `components/ui/field.tsx`, `kbd.tsx`, `popover.tsx`, and `switch.tsx`. They are not in the registry install.

## Check the pinned files

```sh
bun run kevelle:check
```

The check reads no network, and CI runs it on every pull request. It exits with code 1 when:

- a pinned file is missing or differs from the manifest;
- a file in a pinned directory has no manifest row (test files are exempt);
- a manifest row marks a pinned item's file as seed, or points outside its item's directory.

It skips the content of seed files.

## Update the pinned files

1. Run `bun tools/kevelle/vendor.ts`. It fetches every pinned item, rewrites its files, and rewrites the manifest. Seed rows in the manifest stay as they are. A pinned file that the registry no longer serves is removed.
2. Read the diff, then run `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build`.
3. Commit the files and `manifest.json` together.

`bun tools/kevelle/vendor.ts --seed` also overwrites every seed file with the registry copy, which discards this repo's edits to them. Use it only to start the WavePlayer core over.
