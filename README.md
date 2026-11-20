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

Every time readout prints `--:--` until the player knows the time. After a failure that trying again can't fix, such as a browser with no Web Audio, Play turns off and Previous and Next stay on.

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

The bridge leaves a person's own files out of its snapshot, its item lists, and its query results, and it refuses to select or play one by name. An agent that reads the page itself, through the DOM, the accessibility tree, or a screenshot, sees what the person sees. That includes a file's title in the Playlist, the title line, the live region's announcement, the system's now-playing card, and the name of a file that **Add files** rejects.

### Sound

WavePlayer plays through Kalyn's Kevelle libs. `lib/audio` plays each track through the page's Web Audio graph and keeps a feed of its samples. `lib/scope` draws that feed as a figure on a `lib/screen` screen, which renders with WebGPU, or WebGL2 where WebGPU is missing. `components/waveform` puts that screen on the page. When several players share a page, the one that played last answers the system's media keys. `tools/kevelle/vendor.ts` installs these libs from Kalyn's registry and pins them. Don't edit them here. [tools/kevelle/README.md](tools/kevelle/README.md) explains how to update them.

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

### Run the browser check

`wave-player:check` drives a headless Chromium through the `agent-browser` CLI against a running app, `http://localhost:3000` by default. It needs `agent-browser` on your `PATH` and the browser that `agent-browser` installs. The check last ran with `agent-browser` 0.43.0. To install both:

```sh
brew install agent-browser
agent-browser install
```

`agent-browser --help` also lists `npm install -g agent-browser` and `cargo install agent-browser`. Run the check against a production build:

```sh
bun run build
PORT=3100 bun run start
bun run wave-player:check http://localhost:3100
```

### What the browser check covers

The check visits `/wave-player` and each variant route at 1280 and 390 pixels wide. `ROUTES` at the top of `tools/wave-player/check.ts` lists what each route must have and must not have. For example, the bar has Progress and no Seek slider, and `/wave-player/playlist` has Playlist rows and no transport. A route fails when it answers with any status but 200, when it lacks a part that `ROUTES` requires, or when it shows a part that `ROUTES` rules out. The check reports SKIP only where `ROUTES` says the route lacks what that check needs.

On every route, the check confirms that each control has a name, that Tab reaches every control, and that the page has no horizontal scroll. After each check, and before it reloads the page in the settings check, it fails if a closed tooltip is still drawn. Before anything plays, it stores muted settings, reloads the page, and reads the stored settings back. On a route with transport, it also confirms that Mute is pressed, and then it:

- plays, pauses, and confirms that the time and the screen hold while paused,
- where the route has a Seek slider, seeks with the pointer to a point far from where the track stands, and requires the time to land near that point,
- where the route has a Seek slider, seeks with Page Up or Page Down, requires the time to move 10 seconds while paused, and presses Space on Seek,
- presses Next track and requires the next sample track, then presses Previous track within the first 3 seconds, and requires each track to start from 0 and play past its first second,
- changes the volume and the settings, and reloads the page to confirm that the settings persisted.

Where the Playlist's rows show, it plays a row with its Play button, pauses it with Space on the row, and selects another row to confirm that selecting does not play. The Playlist route has no time readout, so there the check proves playback by the row's `aria-current`, its playing state and LED, the live region, and the Media Session, not by the time.

The check reads only what a person or a screen reader can perceive, such as names, `aria-pressed`, `aria-valuetext`, the live region, and the Media Session. It compares screenshots of the screen to confirm that the picture moves while the track plays and holds while it is paused. It prints a table with PASS, FAIL, or SKIP, the measured values, and the counts. It saves the screenshots to the directory it names and exits with code 1 on any FAIL. If the browser fails to launch or the app stops answering, it closes the browser, prints the first error, and exits with code 1. Chromium runs with `--mute-audio`.

## Not done yet

- There is no equalizer.
- Preloading the next track is best effort.
- The checks verify playback by state and screenshots. Nobody has listened to the sound.
- Only Chromium has run the player. Safari and Firefox are unverified.
