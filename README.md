# ui-lab

ui-lab is where Kalyn builds interfaces on [UI SDK](https://ui-sdk.dev) with the Kevelle theme. It is a Next.js 16 app with React 19, Tailwind 4, and `@ui-sdk/react`, run with bun.

## Run it

```sh
bun install
bun run dev
```

Open http://localhost:3000.

## Pages

| Route | What it shows |
| --- | --- |
| `/` | The list of pages. |
| `/theme` | Kevelle's colors, type, alloy keys, and dither. |
| `/ui` | Every Kevelle part on UI SDK, in each of its states. |
| `/wave-player` | The WavePlayer gallery. The **Variant** control picks which variant plays. |
| `/wave-player/card` | The card. |
| `/wave-player/mini` | The mini. |
| `/wave-player/bar` | The bar. |
| `/wave-player/with-playlist` | The card with the Playlist beside it. |
| `/wave-player/playlist` | The Playlist alone. |

## WavePlayer

WavePlayer is a music player built from UI SDK parts. It plays a list of tracks and shows each one's waveform on a square screen. All its code lives in `components/wave-player/`.

### Mount it

`WavePlayerProvider` holds the player's state, the one canvas that every screen draws on, and the live region that announces the track. Put it in a layout so that playback continues when the route changes. Then render a variant anywhere under it:

```tsx
// app/wave-player/layout.tsx
<WavePlayerProvider tracks={TRACKS} keys="page">
	<WavePlayerAgent />
	{children}
</WavePlayerProvider>

// a page under it
<WavePlayerCard />
```

`keys` sets where the letter keys work. With `"focus"`, the default, they work while focus is inside a player. With `"page"` they also work from anywhere on the page outside a player. Use `"page"` on a page whose subject is the player, as this lab does.

The variants are `WavePlayerCard`, `WavePlayerMini`, `WavePlayerBar`, and `WavePlayerWithPlaylist`. Each variant arranges parts and passes them only layout classes. Each part reads the player itself.

### Parts

| File | Parts |
| --- | --- |
| `parts.tsx` | `WavePlayerScreen`, `WavePlayerTitle`, `WavePlayerByline`, `WavePlayerStatus`, `WavePlayerDuration`, `WavePlayerIndex`, `WavePlayerTransport`, `WavePlayerShuffle`, `WavePlayerRepeat`, `WavePlayerVolume`, `WavePlayerLevel`, `WavePlayerMute`, `WavePlayerSettings` |
| `seek.tsx` | `WavePlayerSeek` (a waveform or a line), `WavePlayerTime`, `WavePlayerProgress` |
| `playlist-view.tsx` | `WavePlayerPlaylist`, on the `playlistGrid` primitive in `playlist-grid.ts` |
| `frame.tsx` | `WavePlayerFrame`, the region that every variant renders inside. It owns the keyboard shortcuts. |
| `agent.tsx` | `WavePlayerAgent`, the agent bridge |

The core has no React in it. `model.ts` decides what each command does, `store.ts` runs it against the browser, and `settings.ts` stores the settings in `localStorage` under the key `wave-player`.

### Keyboard

| Key | What it does |
| --- | --- |
| Space | Plays or pauses when focus is on the Seek thumb, on a Playlist row, or on the player outside its controls. A focused button, toggle, or field keeps its own Space. |
| N | Next track |
| P | Previous track. After the first 3 seconds of a track, it restarts the track. |
| M | Mute |
| S | Shuffle |
| R | Cycles Repeat through Off, All, and One. |
| T | Switches the time readout between elapsed and remaining time. |
| Left and Right arrows on Seek | Seek 1 second. |
| Page Up and Page Down on Seek | Seek 10 seconds. |
| Escape while you drag Seek | Drops the drag without seeking. |
| Up and Down arrows, Home, End in the Playlist | Move between rows. Type a letter to jump to a title. |
| Enter in the Playlist | Selects the row. Selecting never plays. The row's Play button plays it. |

The letter keys do nothing while focus is in the Playlist, because there a letter finds a title. They also do nothing in a text field, and, unless the provider has `keys="page"`, while focus is outside the player.

### Agents

`WavePlayerAgent` creates one `createAgent` bridge and registers its tools with WebMCP when the browser has `document.modelContext`. An agent finds each control by its name, for example **Play**, **Seek**, **Volume**, **Level**, **Mute**, **Shuffle**, **Repeat**, **Remaining time**, and **Playlist**. Before an agent can press a control marked `data-agent-confirm`, such as **Add files**, the page asks the person in a dialog that the agent cannot see or answer. `agent.test.tsx` covers each of these steps.

### Sound

WavePlayer plays through Kalyn's Kevelle libs. `lib/audio` plays each track through the page's Web Audio graph and keeps a feed of its samples. `lib/scope` draws that feed as a figure on a `lib/phosphor` screen, which renders with WebGPU, or WebGL2 where WebGPU is missing. `components/waveform` puts that screen on the page. `tools/kevelle/vendor.ts` installs these libs from Kalyn's registry and pins them. Don't edit them here. [tools/kevelle/README.md](tools/kevelle/README.md) explains how to update them.

## Checks

| Command | What it checks |
| --- | --- |
| `bun run lint` | ESLint |
| `bun run typecheck` | Next.js route types, then `tsc` |
| `bun run test` | Vitest in jsdom, including the agent test |
| `bun run build` | The production build |
| `bun run kevelle:check` | The pinned Kevelle files match `tools/kevelle/manifest.json`. |
| `bun run contrast` | Kevelle's color pairs meet their WCAG contrast minimums in both themes. |
| `bun run wave-player:check [base-url]` | WavePlayer in a real browser |

`wave-player:check` drives a headless Chromium through the `agent-browser` CLI against a running app, `http://localhost:3000` by default. Run it against a production build:

```sh
bun run build
PORT=3100 bun run start
bun run wave-player:check http://localhost:3100
```

The check covers `/wave-player` and each variant route, at 1280 and 390 pixels wide. First it checks that every control has a name, that Tab reaches every control, and that the page has no horizontal scroll. It stores muted settings before anything plays. It then plays, pauses, seeks with the pointer and with the keyboard, presses Space on Seek, and changes track. Last, it changes the volume and the settings and reloads the page to confirm that the settings persisted. It reads only what a person or a screen reader can perceive, such as names, `aria-pressed`, `aria-valuetext`, and the live region. It compares screenshots of the screen to confirm that the picture moves while the track plays and holds while it is paused. It prints a table with PASS, FAIL, or SKIP and the measured values, saves the screenshots to the directory it names, and exits with code 1 on any FAIL. It skips a route that returns 404. Chromium runs with `--mute-audio`.

## Not done yet

- There is no equalizer.
- Preloading the next track is best effort.
- The checks verify playback by state and screenshots. Nobody has listened to the sound.
- Only Chromium has run the player. Safari and Firefox are unverified.
