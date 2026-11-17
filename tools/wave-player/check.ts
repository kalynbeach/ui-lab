// Proves in a headless Chromium that each WavePlayer route has its parts and
// that they play, pause, seek, change track, change volume, and keep their
// settings. It reads only what a person or a screen reader can perceive.
// Chromium runs with --mute-audio and every route starts muted, so nothing is
// heard.
//
//   bun tools/wave-player/check.ts [base-url]

import { mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { DEFAULT_SETTINGS, parseSettings, serializeSettings } from "../../components/wave-player/settings"

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "")
const WIDTHS = [1280, 390] as const

type Width = (typeof WIDTHS)[number]

// What each route must have, and must not have. Transport is Play, Previous
// track, Next track, Mute, Level, Shuffle, Repeat, Remaining time, and the
// screen. `time` is the time readout. `rows` lists the widths at which the
// Playlist's rows are on the page. Every SKIP comes from this table.
type Route = {
  readonly path: string
  readonly transport: boolean
  readonly time: "Seek" | "Progress" | null
  readonly rows: readonly Width[]
}

const ROUTES: readonly Route[] = [
  { path: "/wave-player", transport: true, time: "Seek", rows: [] },
  { path: "/wave-player/card", transport: true, time: "Seek", rows: [] },
  { path: "/wave-player/mini", transport: true, time: "Seek", rows: [] },
  { path: "/wave-player/bar", transport: true, time: "Progress", rows: [] },
  // Narrower than the card and the Playlist side by side, the Playlist sits behind Open Playlist.
  { path: "/wave-player/with-playlist", transport: true, time: "Seek", rows: [1280] },
  { path: "/wave-player/playlist", transport: false, time: null, rows: [1280, 390] },
]

const SETTINGS_KEY = "wave-player"
const SESSION = `wave-player-check-${process.pid}`
const SHOTS = join(tmpdir(), `wave-player-check-${Date.now()}`)

const REGION = 'section[aria-label="WavePlayer"]'
const SEEK = `${REGION} [role="slider"][aria-label="Seek"]`
const SCREEN = `${REGION} canvas`
const LEVEL = '[role="slider"][aria-label="Level"]'
const REPEAT_CHECKED = '[role="radiogroup"][aria-label="Repeat"] [aria-checked="true"]'
const POPUPS = ["Volume", "Settings"] as const
const FOCUSABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, [role="slider"], [role="radio"], [role="gridcell"][tabindex]'
const COMPOSITE = '[role="toolbar"], [role="radiogroup"], [role="grid"]'
const CONTROL_ROLES = new Set([
  "button",
  "link",
  "slider",
  "radio",
  "checkbox",
  "switch",
  "textbox",
  "combobox",
  "tab",
  "menuitem",
  "gridcell",
  "spinbutton",
])
const PLAYLIST_ROW = (index: number) => `[role="grid"] > [role="row"]:nth-child(${index + 1})`
const PLAYLIST_TRACK = (index: number) => `${PLAYLIST_ROW(index)} [role="gridcell"][tabindex]`

type Result = "PASS" | "FAIL" | "SKIP"
type Outcome = { readonly result: Result; readonly measured: string }
type Row = { readonly route: string; readonly width: string; readonly check: string } & Outcome

type PlaylistRow = {
  readonly play: string | null
  readonly selected: boolean
  readonly current: boolean
  readonly playing: boolean
  readonly led: boolean
}

type PlayerState = {
  readonly region: boolean
  readonly play: string | null
  readonly time: string | null
  readonly seek: boolean
  readonly progress: boolean
  readonly live: string
  readonly mute: string | null
  readonly level: string | null
  readonly shuffle: string | null
  readonly repeat: string | null
  readonly remaining: { readonly pressed: string | null; readonly text: string } | null
  readonly canvas: boolean
  readonly next: boolean
  readonly previous: boolean
  readonly rows: readonly PlaylistRow[]
  readonly session: { readonly state: string; readonly title: string | null }
  readonly popups: Record<string, string | null>
  // Tooltips that are closed and still drawn.
  readonly strayTips: readonly string[]
  readonly scrollWidth: number
  readonly clientWidth: number
}

class Failed extends Error {}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Failed(message)
}

function ab(...args: string[]): Record<string, unknown> {
  const run = Bun.spawnSync(["agent-browser", "--session", SESSION, "--json", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const text = run.stdout.toString().trim()
  let out: { success?: boolean; data?: Record<string, unknown>; error?: unknown }

  try {
    out = JSON.parse(text)
  } catch {
    throw new Failed(`agent-browser ${args[0]} printed no JSON: ${text || run.stderr.toString().trim()}`)
  }
  if (!out.success) throw new Failed(`agent-browser ${args.join(" ")} failed: ${String(out.error)}`)

  return out.data ?? {}
}

function evaluate<T>(script: string): T {
  return ab("eval", "-b", Buffer.from(script).toString("base64")).result as T
}

const READ_STATE = `(() => {
  const name = (el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim()
  const find = (selector, label, root = document) =>
    root ? [...root.querySelectorAll(selector)].find((el) => name(el) === label && el.checkVisibility()) ?? null : null
  const region = document.querySelector('${REGION}')
  const button = (label, root) => find('button, [role="button"]', label, root)
  const seek = find('[role="slider"]', "Seek", region)
  const progress = find('[role="progressbar"]', "Progress", region)
  const repeat = find('[role="radiogroup"]', "Repeat")
  const remaining = button("Remaining time")
  const session = navigator.mediaSession
  return {
    region: region != null,
    play: button("Play", region)?.getAttribute("aria-pressed") ?? null,
    time: (seek ?? progress)?.getAttribute("aria-valuetext") ?? null,
    seek: seek != null,
    progress: progress != null,
    live: document.querySelector('[aria-live="polite"]')?.textContent ?? "",
    mute: button("Mute")?.getAttribute("aria-pressed") ?? null,
    level: find('[role="slider"]', "Level")?.getAttribute("aria-valuetext") ?? null,
    shuffle: button("Shuffle")?.getAttribute("aria-pressed") ?? null,
    repeat: repeat?.querySelector('[aria-checked="true"]')?.textContent.trim() ?? null,
    remaining: remaining
      ? { pressed: remaining.getAttribute("aria-pressed"), text: remaining.textContent.trim() }
      : null,
    canvas: region?.querySelector("canvas") != null,
    next: button("Next track", region) != null,
    previous: button("Previous track", region) != null,
    rows: [...document.querySelectorAll('[role="grid"] > [role="row"]')]
      .filter((row) => row.checkVisibility())
      .map((row) => ({
        play: row.querySelector('button[aria-label^="Play "]')?.getAttribute("aria-label") ?? null,
        selected: row.getAttribute("aria-selected") === "true",
        current: row.getAttribute("aria-current") === "true",
        playing: row.hasAttribute("data-playing"),
        led: row.querySelector(".led")?.checkVisibility() ?? false,
      })),
    session: { state: session?.playbackState ?? "none", title: session?.metadata?.title ?? null },
    popups: Object.fromEntries(
      ${JSON.stringify(POPUPS)}.map((label) => [label, button(label)?.getAttribute("aria-expanded") ?? null])
    ),
    strayTips: [...document.querySelectorAll('[role="tooltip"]')]
      .filter((tip) => !tip.matches(":popover-open") && tip.checkVisibility())
      .map((tip) => (tip.textContent ?? "").replace(/[^ -~]+/g, " ").trim()),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }
})()`

const state = () => evaluate<PlayerState>(READ_STATE)

async function until<T>(read: () => T, done: (value: T) => boolean, timeout: number): Promise<T> {
  const end = Date.now() + timeout
  let value = read()

  while (!done(value) && Date.now() < end) {
    await Bun.sleep(150)
    value = read()
  }

  return value
}

// "0:11 of 0:32" -> 11
function seconds(text: string | null): number | null {
  const match = text?.match(/^(\d+):(\d{2})/)

  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

const press = (name: string) => ab("find", "role", "button", "click", "--name", name, "--exact")

const NOW_PLAYING = "Now playing "

// On a first visit the page saves its defaults after the store's 250 ms save
// delay, which can overwrite a seed written just before it. Write until the
// seed outlasts that delay.
async function seed(settings: Partial<typeof DEFAULT_SETTINGS>): Promise<boolean> {
  const text = serializeSettings({ ...DEFAULT_SETTINGS, ...settings })
  const key = JSON.stringify(SETTINGS_KEY)

  for (let attempt = 0; attempt < 5; attempt++) {
    evaluate(`localStorage.setItem(${key}, ${JSON.stringify(text)})`)
    await Bun.sleep(750)
    if (evaluate<string | null>(`localStorage.getItem(${key})`) === text) return true
  }

  return false
}

async function reload() {
  ab("reload")
  ab("wait", "--load", "load")
}

// Opens the popup that holds `present`'s control when the route keeps it in
// one. Retries the press, since a press before hydration does nothing.
async function reveal(present: (now: PlayerState) => boolean): Promise<boolean> {
  if (present(state())) return true

  for (const popup of POPUPS) {
    if (state().popups[popup] === null) continue

    const end = Date.now() + 10_000

    while (Date.now() < end) {
      press(popup)
      const now = await until(state, (s) => s.popups[popup] === "true", 1_000)

      if (now.popups[popup] === "true") break
    }
    if (present(await until(state, present, 1_000))) return true
    ab("press", "Escape")
  }

  return false
}

// Level always sits in a popup, so the popup has finished closing once Level is gone.
async function closePopups() {
  if (!Object.values(state().popups).includes("true")) return
  ab("press", "Escape")
  await until(state, (s) => s.level === null, 2_000)
}

function shot(name: string) {
  ab("mouse", "move", "0", "0")
  const path = join(SHOTS, `${name}.png`)
  ab("screenshot", SCREEN, path)

  return path
}

function changedPercent(baseline: string, diff: string): number {
  return ab("diff", "screenshot", "--baseline", baseline, "--selector", SCREEN, "-t", "0", "-o", diff)
    .mismatchPercentage as number
}

// Waits for `title` to start from 0 s and play past its first second.
async function startsOver(title: string): Promise<number> {
  const on = (s: PlayerState) => s.live === NOW_PLAYING + title
  const zero = await until(state, (s) => on(s) && seconds(s.time) === 0, 5_000)
  expect(on(zero) && seconds(zero.time) === 0, `"${title}" never started from 0 s: "${zero.live}", "${zero.time}"`)
  const moving = await until(state, (s) => on(s) && s.play === "true" && (seconds(s.time) ?? 0) >= 1, 10_000)
  const at = seconds(moving.time)
  expect(
    on(moving) && moving.play === "true" && at !== null && at >= 1,
    `"${title}" never played past 0 s: "${moving.live}", "${moving.time}", Play aria-pressed=${moving.play}`
  )

  return at
}

// What a person or screen reader perceives of the Playlist row at `index` while it plays.
function rowPlays(s: PlayerState, index: number, title: string): boolean {
  const row = s.rows[index]

  return (
    row !== undefined &&
    row.current &&
    row.playing &&
    row.led &&
    s.live === NOW_PLAYING + title &&
    s.session.state === "playing" &&
    s.session.title === title
  )
}

function describeRow(s: PlayerState, index: number): string {
  const row = s.rows[index]

  return `row ${index + 1} current=${row?.current} playing=${row?.playing} LED=${row?.led}; live "${s.live}"; media session ${s.session.state} "${s.session.title}"`
}

type At = { readonly route: Route; readonly width: Width; readonly slug: string }

type Check = {
  readonly name: string
  // Why the route skips this check, from ROUTES, or null when it runs.
  readonly skip?: (at: At) => string | null
  // A failure stops the route, so nothing plays before the route is muted.
  readonly gate?: boolean
  readonly run: (at: At) => Promise<string>
}

const needsTransport = ({ route }: At) => (route.transport ? null : `${route.path} has no transport`)
const needsSeek = ({ route }: At) => (route.time === "Seek" ? null : `${route.path} has no Seek slider`)
const needsRows = ({ route, width }: At) =>
  route.rows.includes(width) ? null : `${route.path} shows no Playlist rows at ${width} px`

const CHECKS: readonly Check[] = [
  {
    name: "has its parts",
    gate: true,
    async run({ route, width }) {
      const want = {
        Play: route.transport,
        "Previous track": route.transport,
        "Next track": route.transport,
        screen: route.transport,
        Seek: route.time === "Seek",
        Progress: route.time === "Progress",
        "Playlist rows": route.rows.includes(width),
      }
      const have = (s: PlayerState): Record<keyof typeof want, boolean> => ({
        Play: s.play !== null,
        "Previous track": s.previous,
        "Next track": s.next,
        screen: s.canvas,
        Seek: s.seek,
        Progress: s.progress,
        "Playlist rows": s.rows.length >= 3 && s.rows.every((row) => row.play !== null),
      })
      const parts = Object.keys(want) as (keyof typeof want)[]
      const wrong = (s: PlayerState) => parts.filter((part) => have(s)[part] !== want[part])
      const now = await until(state, (s) => s.region && wrong(s).length === 0, 5_000)
      expect(now.region, "no WavePlayer region")
      const missing = wrong(now)
      expect(
        missing.length === 0,
        missing.map((part) => `${part} ${want[part] ? "missing" : "present"}`).join(", ")
      )

      return parts.filter((part) => want[part]).join(", ") + (now.rows.length ? ` (${now.rows.length} rows)` : "")
    },
  },
  {
    name: "controls named",
    async run() {
      const refs = Object.values(ab("snapshot", "-i").refs as Record<string, { role: string; name: string }>)
      const controls = refs.filter((ref) => CONTROL_ROLES.has(ref.role))
      const unnamed = controls.filter((ref) => !ref.name.trim())
      expect(controls.length > 0, "found no controls")
      expect(unnamed.length === 0, `unnamed: ${unnamed.map((ref) => ref.role).join(", ")}`)

      return `${controls.length} controls, all named`
    },
  },
  {
    name: "no horizontal scroll",
    async run() {
      const { scrollWidth, clientWidth } = state()
      expect(scrollWidth <= clientWidth, `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`)

      return `${scrollWidth} <= ${clientWidth}`
    },
  },
  {
    name: "Tab reaches every control",
    async run() {
      const stops = evaluate<number>(`(() => {
        let count = 0
        for (const el of document.querySelectorAll('${FOCUSABLE}')) {
          if (el.disabled || !el.checkVisibility()) continue
          const stop = el.closest('${COMPOSITE}') ?? el
          if (!stop.hasAttribute("data-check-stop")) stop.setAttribute("data-check-stop", String(count++))
        }
        document.activeElement?.blur()
        return count
      })()`)
      expect(stops > 0, "found no tab stops")
      const reached = new Set<string>()

      for (let presses = 0; presses < stops + 5 && reached.size < stops; presses++) {
        ab("press", "Tab")
        const at = evaluate<string | null>(
          `document.activeElement?.closest("[data-check-stop]")?.getAttribute("data-check-stop") ?? null`
        )
        if (at !== null) reached.add(at)
      }
      const missed = evaluate<string[]>(
        `[...document.querySelectorAll("[data-check-stop]")]
          .filter((el) => !${JSON.stringify([...reached])}.includes(el.getAttribute("data-check-stop")))
          .map((el) => el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 30))`
      )
      expect(missed.length === 0, `Tab never reached: ${missed.join(", ")}`)

      return `${stops} tab stops, all reached`
    },
  },
  {
    name: "muted before play",
    gate: true,
    async run({ route }) {
      expect(await seed({ muted: true }), "the page kept overwriting the seeded settings")
      await reload()
      await until(state, (s) => (route.transport ? s.play !== null : s.rows.length > 0), 5_000)
      // Past the save delay, the stored settings are the ones the page loaded.
      await Bun.sleep(750)
      const stored = parseSettings(evaluate<string | null>(`localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})`))
      expect(stored?.muted === true, `the stored settings read muted=${stored?.muted} after reload`)
      if (!route.transport) {
        const playing = state().rows.findIndex((row) => row.playing)
        expect(playing === -1, `row ${playing + 1} is playing before any Play`)

        return "stored settings muted; no row playing"
      }
      expect(await reveal((s) => s.mute !== null), "found no Mute control in Volume or Settings")
      const now = state()
      await closePopups()
      expect(now.mute === "true", `Mute reads aria-pressed=${now.mute} after seeding muted settings`)

      return "stored settings muted; Mute pressed"
    },
  },
  {
    name: "play",
    skip: needsTransport,
    async run({ slug }) {
      press("Play")
      const pressed = await until(state, (s) => s.play === "true", 5_000)
      expect(pressed.play === "true", `Play reads aria-pressed=${pressed.play}`)
      const started = await until(state, (s) => (seconds(s.time) ?? 0) >= 1, 15_000)
      const from = seconds(started.time)
      expect(from !== null && from >= 1, `time never advanced past 0: "${started.time}"`)
      const startedAt = Date.now()
      await Bun.sleep(2_000)
      const to = seconds(state().time)
      const elapsed = ((Date.now() - startedAt) / 1_000).toFixed(1)
      expect(to !== null && to - from >= 1, `time "${started.time}" -> "${state().time}" in ${elapsed} s`)
      expect(state().canvas, "the WavePlayer region has no canvas")
      const before = shot(`${slug}-playing`)
      await Bun.sleep(500)
      const changed = changedPercent(before, join(SHOTS, `${slug}-playing-diff.png`))
      expect(changed > 0, "the screen did not change between two screenshots 0.5 s apart")

      return `time ${from}s -> ${to}s in ${elapsed} s; screen ${changed.toFixed(1)}% changed`
    },
  },
  {
    name: "pause holds",
    skip: needsTransport,
    async run({ slug }) {
      expect(state().play === "true", "not playing, so there was nothing to pause")
      press("Play")
      const paused = await until(state, (s) => s.play === "false", 5_000)
      expect(paused.play === "false", `Play reads aria-pressed=${paused.play} after pausing`)
      await Bun.sleep(300)
      const from = state().time
      const before = shot(`${slug}-paused`)
      await Bun.sleep(1_000)
      const to = state().time
      const changed = changedPercent(before, join(SHOTS, `${slug}-paused-diff.png`))
      expect(from === to, `time moved while paused: "${from}" -> "${to}"`)
      expect(changed === 0, `the paused screen changed ${changed}% in 1 s`)

      return `time held at ${seconds(from)}s; screen 0% changed in 1 s`
    },
  },
  {
    name: "seek with pointer",
    skip: needsSeek,
    async run() {
      const before = state().time
      const from = seconds(before)
      const duration = seconds(before?.split(" of ")[1] ?? null)
      expect(from !== null && duration !== null, `Seek reads "${before}" with no time or duration`)
      // The far half of the track from where it stands, so a press that does nothing lands far from the target.
      const fraction = from < duration / 2 ? 0.75 : 0.25
      const target = duration * fraction
      const tolerance = duration / 20
      const point = evaluate<{ x: number; y: number } | null>(`(() => {
        let el = document.querySelector('${SEEK}')
        while (el && el.getBoundingClientRect().width < 50) el = el.parentElement
        if (!el) return null
        const box = el.getBoundingClientRect()
        return { x: box.left + box.width * ${fraction}, y: box.top + box.height / 2 }
      })()`)
      expect(point !== null, "found no Seek track to press")
      ab("mouse", "move", String(point.x), String(point.y))
      ab("mouse", "down", "left")
      ab("mouse", "up", "left")
      const to = seconds((await until(state, (s) => s.time !== before, 2_000)).time)
      await Bun.sleep(500)
      const settled = seconds(state().time)
      const pressed = `a press at ${fraction * 100}% moved time ${from}s -> ${to}s of ${duration}s`
      expect(to !== null && to !== from, `${pressed}, so the press did not seek`)
      expect(Math.abs(to - target) <= tolerance, `${pressed}, more than ${tolerance}s from ${target}s`)
      expect(settled === to, `time moved from ${to}s to ${settled}s after the seek while paused`)

      return `${pressed}; target ${target}s`
    },
  },
  {
    name: "seek with keys",
    skip: needsSeek,
    async run() {
      ab("focus", SEEK)
      const before = state().time
      const from = seconds(before)
      const duration = seconds(before?.split(" of ")[1] ?? null)
      expect(from !== null && duration !== null, `Seek reads "${before}" with no time or duration`)
      // Toward the middle, so the seek never clamps at an end.
      const key = from > duration / 2 ? "PageDown" : "PageUp"
      const sign = key === "PageUp" ? 1 : -1
      ab("press", key)
      const to = seconds((await until(state, (s) => seconds(s.time) !== from, 2_000)).time)
      expect(to !== null && sign * (to - from) >= 5, `${key} moved time ${from}s -> ${to}s`)

      return `${key}: ${from}s -> ${to}s`
    },
  },
  {
    name: "Space on Seek",
    skip: needsSeek,
    async run() {
      const before = state().play
      ab("focus", SEEK)
      ab("press", "Space")
      const toggled = await until(state, (s) => s.play !== before, 3_000)
      await Bun.sleep(800)
      const after = state().play
      expect(toggled.play !== before, `Play stayed aria-pressed=${before}`)
      expect(after === toggled.play, `Play flipped back to ${after}, so Space toggled twice`)

      return `Play aria-pressed ${before} -> ${after}`
    },
  },
  {
    name: "next and previous",
    skip: needsTransport,
    async run() {
      if (state().play !== "true") {
        press("Play")
        await until(state, (s) => s.play === "true" && s.live.startsWith(NOW_PLAYING), 5_000)
      }
      const live = state().live
      expect(live.startsWith(NOW_PLAYING), `live region reads "${live}" while playing`)
      const first = live.slice(NOW_PLAYING.length)
      press("Next track")
      const changed = (await until(state, (s) => s.live !== live, 5_000)).live
      expect(changed.startsWith(NOW_PLAYING) && changed !== live, `the live region reads "${changed}" after Next track`)
      const second = changed.slice(NOW_PLAYING.length)
      const secondAt = await startsOver(second)
      // Previous restarts a track after its first 3 s, and goes back only before that.
      const pressedAt = seconds(state().time)
      expect(pressedAt !== null && pressedAt < 3, `"${second}" was at ${pressedAt}s when Previous track was pressed`)
      press("Previous track")
      const firstAt = await startsOver(first)

      return `"${first}" -> "${second}" played to ${secondAt}s -> Previous at ${pressedAt}s -> "${first}" played to ${firstAt}s`
    },
  },
  {
    name: "volume",
    skip: needsTransport,
    async run() {
      if (state().play === "true") {
        press("Play")
        await until(state, (s) => s.play === "false", 5_000)
      }
      expect(await reveal((s) => s.level !== null), "found no Level slider in Volume or Settings")
      const from = state().level
      ab("focus", LEVEL)
      ab("press", "ArrowLeft")
      ab("press", "ArrowLeft")
      const lowered = await until(state, (s) => s.level !== from, 2_000)
      if (lowered.mute === "false") {
        press("Mute")
        await until(state, (s) => s.mute === "true", 2_000)
      }
      const now = state()
      await closePopups()
      expect(now.mute === "true", `Mute reads aria-pressed=${now.mute} after pressing Mute again`)
      expect(lowered.level !== from, `Level stayed ${from} after two ArrowLeft presses`)

      return `Level ${from} -> ${lowered.level}, paused; Mute pressed again`
    },
  },
  {
    name: "settings persist",
    skip: needsTransport,
    async run() {
      expect(state().play !== "true", "still playing, so settings were not changed")
      expect(await reveal((s) => s.shuffle !== null), "found no Shuffle control")
      press("Shuffle")
      expect(await reveal((s) => s.repeat !== null), "found no Repeat control")
      ab("focus", REPEAT_CHECKED)
      ab("press", "ArrowRight")
      await closePopups()
      expect(state().remaining !== null, "found no Remaining time control")
      press("Remaining time")
      await Bun.sleep(300)
      expect(await reveal((s) => s.level !== null), "found no Level slider")
      const level = state().level
      await closePopups()
      await reload()

      const remaining = (await until(state, (s) => s.remaining?.pressed === "true", 3_000)).remaining
      expect(remaining?.pressed === "true", "Remaining time is not pressed after reload")
      expect(await reveal((s) => s.mute !== null), "found no Mute control after reload")
      const after = state()
      expect(after.mute === "true", `Mute reads aria-pressed=${after.mute} after reload`)
      expect(after.level === level, `Level reads ${after.level} after reload, not ${level}`)
      await closePopups()
      await reveal((s) => s.shuffle !== null)
      expect(state().shuffle === "true", `Shuffle reads aria-pressed=${state().shuffle} after reload`)
      await reveal((s) => s.repeat !== null)
      expect(state().repeat === "All", `Repeat reads ${state().repeat} after reload, not All`)
      await closePopups()

      return `after reload: time ${remaining.text}, muted, Level ${level}, Shuffle on, Repeat All`
    },
  },
  {
    name: "row Play plays",
    skip: needsRows,
    async run() {
      const before = state()
      const playing = before.rows.findIndex((row) => row.playing)
      expect(playing === -1, `row ${playing + 1} was playing before its Play was pressed`)
      // The second row, so the track that plays is never the one already loaded.
      const name = before.rows[1]?.play
      expect(name != null, "row 2 has no Play control")
      const title = name.slice("Play ".length)
      press(name)
      const started = await until(state, (s) => rowPlays(s, 1, title), 10_000)
      expect(rowPlays(started, 1, title), `after ${name}: ${describeRow(started, 1)}`)
      await Bun.sleep(1_500)
      const held = state()
      expect(rowPlays(held, 1, title), `1.5 s after ${name}: ${describeRow(held, 1)}`)

      return `${name}: row 2 current, playing, LED on; "${held.live}"; media session playing "${title}"; held 1.5 s`
    },
  },
  {
    name: "Space on a row",
    skip: needsRows,
    async run() {
      const before = state()
      const index = before.rows.findIndex((row) => row.playing)
      expect(index !== -1, "no row is playing, so Space had nothing to pause")
      ab("focus", PLAYLIST_TRACK(index))
      ab("press", "Space")
      const paused = (s: PlayerState) =>
        s.rows[index]?.current === true && !s.rows[index]?.playing && s.session.state === "paused"
      const toggled = await until(state, paused, 3_000)
      expect(paused(toggled), `after Space: ${describeRow(toggled, index)}`)
      await Bun.sleep(800)
      const after = state()
      expect(paused(after), `0.8 s after Space: ${describeRow(after, index)}`)

      return `Space on row ${index + 1}: playing -> paused, LED off, media session paused`
    },
  },
  {
    name: "row select does not play",
    skip: needsRows,
    async run() {
      const before = state()
      const current = before.rows.findIndex((row) => row.current)
      expect(current !== -1, "no row is current")
      expect(before.rows.every((row) => !row.playing), "a row is still playing, so selecting proves nothing")
      const target = (current + 1) % before.rows.length
      ab("click", PLAYLIST_TRACK(target))
      const selected = await until(state, (s) => s.rows[target]?.selected === true, 3_000)
      expect(selected.rows[target]?.selected === true, `row ${target + 1} is not selected after a click`)
      await Bun.sleep(1_500)
      const after = state()
      const playing = after.rows.findIndex((row) => row.playing)
      expect(playing === -1, `row ${playing + 1} started playing after row ${target + 1} was selected`)
      expect(after.rows[target]?.current === false, `row ${target + 1} became current when selected`)
      expect(after.rows[current]?.current === true, `row ${current + 1} stopped being current`)
      expect(after.live === before.live, `the live region changed "${before.live}" -> "${after.live}"`)
      expect(after.session.state !== "playing", `media session reads ${after.session.state}`)

      return `row ${target + 1} selected; row ${current + 1} still current; nothing playing after 1.5 s`
    },
  },
]

async function runRoute(route: Route, width: Width): Promise<Row[]> {
  const rows: Row[] = []
  const at: At = { route, width, slug: `${route.path.replaceAll("/", "-").replace(/^-/, "")}-${width}` }
  const row = (check: string, outcome: Outcome): Row => ({ route: route.path, width: String(width), check, ...outcome })

  ab("set", "viewport", String(width), "900")
  ab("open", BASE + route.path)
  ab("wait", "--load", "load")
  await until(state, (s) => s.region, 5_000)

  for (const [index, check] of CHECKS.entries()) {
    const skip = check.skip?.(at) ?? null

    if (skip !== null) {
      rows.push(row(check.name, { result: "SKIP", measured: skip }))
      continue
    }

    let outcome: Outcome

    try {
      const measured = await check.run(at)
      // A fast press can close a tooltip before the page renders it open. It
      // then stays drawn over its neighbors and takes their presses.
      const stray = state().strayTips

      expect(stray.length === 0, `a closed tooltip is still drawn: ${stray.join(", ")}`)
      outcome = { result: "PASS", measured }
    } catch (error) {
      outcome = { result: "FAIL", measured: error instanceof Error ? error.message : String(error) }
    }
    rows.push(row(check.name, outcome))

    if (check.gate && outcome.result === "FAIL") {
      for (const rest of CHECKS.slice(index + 1)) {
        const reason = rest.skip?.(at) ?? null
        rows.push(
          row(rest.name, reason === null ? { result: "FAIL", measured: `not run: ${check.name} failed` } : { result: "SKIP", measured: reason })
        )
      }
      break
    }
  }

  return rows
}

function table(rows: readonly Row[]): string {
  const head = { route: "Route", width: "Width", check: "Check", result: "Result", measured: "Measured" }
  const keys = Object.keys(head) as (keyof typeof head)[]
  const all = [head, ...rows]
  const widths = keys.map((key) => Math.max(...all.map((row) => row[key].length)))
  const line = (row: typeof head) =>
    keys.map((key, index) => row[key].padEnd(widths[index] ?? 0)).join("  ").trimEnd()

  return [line(head), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)].join("\n")
}

async function main() {
  mkdirSync(SHOTS, { recursive: true })
  const rows: Row[] = []
  let failure: unknown = null

  try {
    const launch = ab("--webgpu", "--args", "--mute-audio", "open", "about:blank")
    const lifecycle = launch.lifecycle as { launched?: boolean } | undefined

    if (lifecycle?.launched !== true) {
      throw new Failed(`session ${SESSION} was already running, so --mute-audio may not apply`)
    }

    for (const route of ROUTES) {
      const status = (await fetch(BASE + route.path)).status

      if (status !== 200) {
        rows.push({ route: route.path, width: "-", check: "route answers", result: "FAIL", measured: `HTTP ${status}` })
        continue
      }
      for (const width of WIDTHS) rows.push(...(await runRoute(route, width)))
    }
  } catch (error) {
    failure = error
  }

  try {
    ab("close")
  } catch (error) {
    failure ??= error
  }

  if (rows.length > 0) console.log(table(rows))
  console.log(`\nScreenshots: ${SHOTS}`)
  console.log("Sound was not checked by ear: Chromium ran with --mute-audio and the player muted.")

  if (failure !== null) {
    console.error(`\nStopped early: ${failure instanceof Error ? failure.message : String(failure)}`)
    process.exit(1)
  }
  const counts = (["PASS", "FAIL", "SKIP"] as const).map((result) => `${rows.filter((row) => row.result === result).length} ${result}`)
  console.log(counts.join(", "))

  if (rows.some((row) => row.result === "FAIL")) process.exit(1)
}

await main()
