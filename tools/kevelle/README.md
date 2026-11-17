# Kevelle libs

`vendor.ts` installs Kevelle code from Kalyn's own registry at `https://registry.kkb.systems/r/kevelle`. Each item is a JSON file that lists its source files. The script writes each file to its target in this repo and rewrites its imports from registry paths (`@/registry/kevelle/lib/`, `/ui/`, `/blocks/`) to this app's paths (`@/lib/`, `@/components/ui/`, `@/components/`). It changes nothing else.

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

The check reads no network. It hashes each pinned file and exits with code 1 when one is missing or differs from the manifest. CI runs it on every pull request. It skips seed files.

## Update the pinned files

1. Run `bun tools/kevelle/vendor.ts`. It fetches every pinned item, rewrites its files, and rewrites the manifest. Seed rows in the manifest stay as they are.
2. Read the diff, then run `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build`.
3. Commit the files and `manifest.json` together.

`bun tools/kevelle/vendor.ts --seed` also overwrites every seed file with the registry copy, which discards this repo's edits to them. Use it only to start the WavePlayer core over.
