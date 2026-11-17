// Proves in a headless Chromium that each WavePlayer route plays, pauses,
// seeks, changes track, changes volume, and keeps its settings. It reads only
// what a person or a screen reader can perceive. Chromium runs with
// --mute-audio and every route starts muted, so nothing is heard.
//
//   bun tools/wave-player/check.ts [base-url]

import { mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { DEFAULT_SETTINGS, serializeSettings } from "../../components/wave-player/settings"

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "")
const ROUTES = [
  "/wave-player",
  "/wave-player/card",
  "/wave-player/mini",
  "/wave-player/bar",
  "/wave-player/with-playlist",
  "/wave-player/playlist",
]
const WIDTHS = [1280, 390] as const
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

type Result = "PASS" | "FAIL" | "SKIP"
type Outcome = { readonly result: Result; readonly measured: string }
type Row = { readonly route: string; readonly width: string; readonly check: string } & Outcome

type PlayerState = {
  readonly play: string | null
  readonly time: string | null
  readonly seek: boolean
  readonly live: string
  readonly mute: string | null
  readonly level: string | null
  readonly shuffle: string | null
  readonly repeat: string | null
  readonly remaining: { readonly pressed: string | null; readonly text: string } | null
  readonly canvas: boolean
  readonly next: boolean
  readonly previous: boolean
  readonly popups: Record<string, string | null>
  readonly scrollWidth: number
  readonly clientWidth: number
}

class Failed extends Error {}
class Skipped extends Error {}

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
  const time =
    find('[role="slider"]', "Seek", region) ?? find('[role="progressbar"]', "Progress", region)
  const repeat = find('[role="radiogroup"]', "Repeat")
  const remaining = button("Remaining time")
  return {
    play: button("Play", region)?.getAttribute("aria-pressed") ?? null,
    time: time?.getAttribute("aria-valuetext") ?? null,
    seek: find('[role="slider"]', "Seek", region) != null,
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
    popups: Object.fromEntries(
      ${JSON.stringify(POPUPS)}.map((label) => [label, button(label)?.getAttribute("aria-expanded") ?? null])
    ),
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

type Check = { readonly name: string; readonly run: (slug: string) => Promise<string> }

const MUTED = "muted before play"

const CHECKS: readonly Check[] = [
  {
    name: "controls named",
    async run() {
      const refs = Object.values(ab("snapshot", "-i").refs as Record<string, { role: string; name: string }>)
      const controls = refs.filter((ref) => CONTROL_ROLES.has(ref.role))
      const unnamed = controls.filter((ref) => !ref.name.trim())
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
    name: MUTED,
    async run() {
      expect(await seed({ muted: true }), "the page kept overwriting the seeded settings")
      await reload()
      if ((await until(state, (s) => s.play !== null, 5_000)).play === null)
        throw new Skipped("no Play control")
      expect(await reveal((s) => s.mute !== null), "found no Mute control in Volume or Settings")
      const now = state()
      await closePopups()
      expect(now.mute === "true", `Mute reads aria-pressed=${now.mute} after seeding muted settings`)

      return "Mute pressed"
    },
  },
  {
    name: "play",
    async run(slug) {
      if (state().play === null) throw new Skipped("no Play control")
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
    async run(slug) {
      if (state().play !== "true") throw new Skipped("not playing")
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
    async run() {
      if (!state().seek) throw new Skipped("no Seek slider")
      const track = evaluate<{ x: number; y: number } | null>(`(() => {
        let el = document.querySelector('${SEEK}')
        while (el && el.getBoundingClientRect().width < 50) el = el.parentElement
        if (!el) return null
        const box = el.getBoundingClientRect()
        return { x: box.left + box.width / 4, y: box.top + box.height / 2 }
      })()`)
      expect(track !== null, "found no Seek track to press")
      const before = state().time
      const from = seconds(before)
      const duration = seconds(before?.split(" of ")[1] ?? null)
      expect(duration !== null, `Seek reads "${before}" with no duration`)
      ab("mouse", "move", String(track.x), String(track.y))
      ab("mouse", "down", "left")
      ab("mouse", "up", "left")
      const to = seconds((await until(state, (s) => s.time !== before, 2_000)).time)
      const target = duration / 4
      expect(to !== null && Math.abs(to - target) <= duration / 10, `a press at 25% moved time ${from}s -> ${to}s of ${duration}s`)

      return `a press at 25%: ${from}s -> ${to}s of ${duration}s`
    },
  },
  {
    name: "seek with keys",
    async run() {
      if (!state().seek) throw new Skipped("no Seek slider")
      ab("focus", SEEK)
      const from = seconds(state().time)
      ab("press", "PageUp")
      const moved = await until(state, (s) => seconds(s.time) !== from, 2_000)
      const to = seconds(moved.time)
      expect(from !== null && to !== null && to - from >= 5, `PageUp moved time ${from}s -> ${to}s`)

      return `PageUp: ${from}s -> ${to}s`
    },
  },
  {
    name: "Space on Seek",
    async run() {
      if (!state().seek) throw new Skipped("no Seek slider")
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
    async run() {
      if (!state().next || !state().previous) throw new Skipped("no Next or Previous track")
      if (state().play !== "true") {
        press("Play")
        await until(state, (s) => s.play === "true" && s.live.startsWith("Now playing"), 5_000)
      }
      const first = state().live
      expect(first.startsWith("Now playing"), `live region reads "${first}" while playing`)
      press("Next track")
      const next = (await until(state, (s) => s.live !== first, 5_000)).live
      expect(next !== first, `the live region stayed "${first}" after Next track`)
      const pressedAt = Date.now()
      press("Previous track")
      const back = (await until(state, (s) => s.live === first, 5_000)).live
      expect(back === first, `the live region reads "${back}" after Previous track, not "${first}"`)

      return `"${first}" -> "${next}" -> back in ${Date.now() - pressedAt} ms`
    },
  },
  {
    name: "volume",
    async run() {
      if (state().play === "true") {
        press("Play")
        await until(state, (s) => s.play === "false", 5_000)
      }
      if (!(await reveal((s) => s.level !== null))) throw new Skipped("no Level slider")
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
    async run() {
      expect(state().play !== "true", "still playing, so settings were not changed")
      const changed: string[] = []

      if (await reveal((s) => s.shuffle !== null)) {
        press("Shuffle")
        changed.push("Shuffle")
      }
      if (await reveal((s) => s.repeat !== null)) {
        ab("focus", REPEAT_CHECKED)
        ab("press", "ArrowRight")
        changed.push("Repeat")
      }
      await closePopups()
      if (state().remaining !== null) {
        press("Remaining time")
        changed.push("Remaining time")
      }
      if (changed.length === 0) throw new Skipped("no Shuffle, Repeat, or Remaining time")
      await Bun.sleep(300)
      const level = (await reveal((s) => s.level !== null)) ? state().level : null
      await closePopups()
      await reload()

      const seen: string[] = []
      if (changed.includes("Remaining time")) {
        const remaining = (await until(state, (s) => s.remaining?.pressed === "true", 3_000)).remaining
        expect(remaining?.pressed === "true", "Remaining time is not pressed after reload")
        seen.push(`time ${remaining.text}`)
      }
      expect(await reveal((s) => s.mute !== null), "found no Mute control after reload")
      const after = state()
      expect(after.mute === "true", `Mute reads aria-pressed=${after.mute} after reload`)
      seen.push("muted")
      if (level !== null) {
        expect(after.level === level, `Level reads ${after.level} after reload, not ${level}`)
        seen.push(`Level ${level}`)
      }
      await closePopups()
      if (changed.includes("Shuffle")) {
        await reveal((s) => s.shuffle !== null)
        expect(state().shuffle === "true", `Shuffle reads aria-pressed=${state().shuffle} after reload`)
        seen.push("Shuffle on")
      }
      if (changed.includes("Repeat")) {
        await reveal((s) => s.repeat !== null)
        expect(state().repeat === "All", `Repeat reads ${state().repeat} after reload, not All`)
        seen.push("Repeat All")
      }
      await closePopups()

      return `after reload: ${seen.join(", ")}`
    },
  },
]

async function runRoute(route: string, width: number): Promise<Row[]> {
  const rows: Row[] = []
  const slug = `${route.replaceAll("/", "-").replace(/^-/, "")}-${width}`

  ab("set", "viewport", String(width), "900")
  ab("open", BASE + route)
  ab("wait", "--load", "load")
  await until(state, (s) => s.play !== null, 5_000)

  for (const [index, check] of CHECKS.entries()) {
    let outcome: Outcome

    try {
      outcome = { result: "PASS", measured: await check.run(slug) }
    } catch (error) {
      outcome =
        error instanceof Skipped
          ? { result: "SKIP", measured: error.message }
          : { result: "FAIL", measured: error instanceof Error ? error.message : String(error) }
    }
    rows.push({ route, width: String(width), check: check.name, ...outcome })

    // Nothing plays on a route that could not be muted.
    if (check.name === MUTED && outcome.result !== "PASS") {
      for (const rest of CHECKS.slice(index + 1))
        rows.push({ route, width: String(width), check: rest.name, result: "SKIP", measured: outcome.result === "SKIP" ? outcome.measured : "not muted" })
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
  const launch = ab("--webgpu", "--args", "--mute-audio", "open", "about:blank")
  const lifecycle = launch.lifecycle as { launched?: boolean } | undefined

  try {
    if (lifecycle?.launched !== true) {
      throw new Failed(`session ${SESSION} was already running, so --mute-audio may not apply`)
    }

    for (const route of ROUTES) {
      const status = (await fetch(BASE + route)).status

      if (status === 404) {
        rows.push({ route, width: "-", check: "route", result: "SKIP", measured: "404" })
        continue
      }
      for (const width of WIDTHS) rows.push(...(await runRoute(route, width)))
    }
  } finally {
    ab("close")
  }

  console.log(table(rows))
  console.log(`\nScreenshots: ${SHOTS}`)
  console.log("Sound was not checked by ear: Chromium ran with --mute-audio and the player muted.")

  if (rows.some((row) => row.result === "FAIL")) process.exit(1)
}

await main()
