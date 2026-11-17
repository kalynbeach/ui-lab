// Measures WCAG 2 contrast for Kevelle's token pairs in light and dark, read
// straight from app/globals.css, and exits 1 when a pair misses its minimum.
// Colors resolve the way a browser paints them on an sRGB screen: oklch
// clipped to sRGB, color-mix and alpha blended in gamma-encoded sRGB.

import { readFileSync } from "node:fs"

type Rgba = { r: number; g: number; b: number; a: number }
type Theme = "light" | "dark"
type Pair = { fg: string; bg: string; min: number; why: string }

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")

function blockAfter(marker: string): string {
  const start = css.indexOf(marker)
  if (start < 0) throw new Error(`globals.css has no ${JSON.stringify(marker)}`)
  const open = css.lastIndexOf("{", start + marker.length)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error(`unclosed block after ${marker}`)
}

function declarations(block: string): Map<string, string> {
  const flat = block.replace(/@variant[^{]*\{[\s\S]*$/, "")
  const out = new Map<string, string>()
  for (const match of flat.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(match[1], match[2].replace(/\s+/g, " ").trim())
  }
  return out
}

const light = declarations(blockAfter(":root {\n  color-scheme: light;"))
const darkOnly = declarations(blockAfter(":root,\n.dark {\n  @variant dark {"))
const tokens: Record<Theme, Map<string, string>> = {
  light,
  dark: new Map([...light, ...darkOnly]),
}

function splitArgs(inner: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of inner) {
    if (char === "(") depth++
    if (char === ")") depth--
    if (char === "," && depth === 0) {
      parts.push(current.trim())
      current = ""
    } else current += char
  }
  parts.push(current.trim())
  return parts
}

const encode = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
const decode = (v: number) =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
const clip = (v: number) => Math.min(1, Math.max(0, v))

const outOfGamut = new Set<string>()

function oklch(text: string): Rgba {
  const [l, c, h, alpha] = text
    .slice(text.indexOf("(") + 1, -1)
    .replace("/", " ")
    .split(/\s+/)
    .map(Number)
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((v) => v ** 3)
  const linear = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ]
  if (linear.some((v) => v < -1e-4 || v > 1 + 1e-4)) outOfGamut.add(text)
  const [r, g, bl] = linear.map((v) => clip(encode(v)))
  return { r, g, b: bl, a: Number.isNaN(alpha) || alpha === undefined ? 1 : alpha }
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a)
  const mix = (t: number, b: number) =>
    a === 0 ? 0 : (t * top.a + b * bottom.a * (1 - top.a)) / a
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a }
}

function resolve(value: string, theme: Theme, seen: string[] = []): Rgba {
  const text = value.trim()
  const variable = text.match(/^var\((--[\w-]+)\)$/)
  if (variable) return token(variable[1], theme, seen)
  if (text.startsWith("oklch(")) return oklch(text)
  if (text.startsWith("color-mix(")) {
    const [space, first, second] = splitArgs(text.slice(10, -1))
    if (space !== "in srgb") throw new Error(`unsupported mix space in ${text}`)
    const weight = (part: string) => part.match(/\s([\d.]+)%$/)?.[1]
    const strip = (part: string) => part.replace(/\s[\d.]+%$/, "")
    const p1 = weight(first)
    const p2 = weight(second)
    const w1 = p1 ? Number(p1) / 100 : p2 ? 1 - Number(p2) / 100 : 0.5
    const a = resolve(strip(first), theme, seen)
    const b = resolve(strip(second), theme, seen)
    const alpha = a.a * w1 + b.a * (1 - w1)
    const channel = (x: number, y: number) =>
      alpha === 0 ? 0 : (x * a.a * w1 + y * b.a * (1 - w1)) / alpha
    return { r: channel(a.r, b.r), g: channel(a.g, b.g), b: channel(a.b, b.b), a: alpha }
  }
  throw new Error(`cannot resolve ${text}`)
}

function token(name: string, theme: Theme, seen: string[] = []): Rgba {
  if (seen.includes(name)) throw new Error(`cycle: ${[...seen, name].join(" -> ")}`)
  const value = tokens[theme].get(name)
  if (value === undefined) throw new Error(`${name} is not defined in ${theme}`)
  return resolve(value, theme, [...seen, name])
}

function sheenStops(theme: Theme): [Rgba, Rgba] {
  const sheen = tokens[theme].get("--alloy-sheen") ?? ""
  const stops = splitArgs(sheen.slice("linear-gradient(".length, -1))
  return [oklch(stops[0]), oklch(stops[1])]
}

// A surface named "a+b" paints a over b; "sheen:x" is x under each alloy stop.
function surfaces(name: string, theme: Theme): Rgba[] {
  if (name.startsWith("sheen:")) {
    const face = surfaces(name.slice(6), theme)[0]
    return sheenStops(theme).map((stop) => over(stop, face))
  }
  const layers = name.split("+").map((part) => token(`--${part}`, theme))
  return [layers.reduceRight((below, layer) => over(layer, below))]
}

const luminance = ({ r, g, b }: Rgba) =>
  0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b)

function ratio(fg: Rgba, bg: Rgba): number {
  const painted = over(fg, bg)
  const [hi, lo] = [luminance(painted), luminance(bg)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const text = (fg: string, bg: string, why: string): Pair => ({ fg, bg, min: 4.5, why })
const edge = (fg: string, bg: string, why: string): Pair => ({ fg, bg, min: 3, why })

const pairs: Pair[] = [
  text("foreground", "background", "body text"),
  text("card-foreground", "card", "card text"),
  text("popover-foreground", "popover", "popover text"),
  text("muted-foreground", "background", "secondary text"),
  text("muted-foreground", "card", "secondary text on a card"),
  text("muted-foreground", "muted", "secondary text on a muted fill"),
  text("accent-foreground", "accent", "highlighted item"),
  text("link", "background", "link"),
  text("signal-foreground", "signal", "selection"),
  text("destructive", "background", "status text"),
  text("destructive", "destructive-subtle", "status badge"),
  text("destructive", "destructive-subtle-hover", "status badge, hovered"),
  text("success", "background", "status text"),
  text("success", "success-subtle", "status badge"),
  text("success", "success-subtle-hover", "status badge, hovered"),
  text("warning", "background", "status text"),
  text("warning", "warning-subtle", "status badge"),
  text("warning", "warning-subtle-hover", "status badge, hovered"),
  text("primary-foreground", "sheen:primary", "primary key, selected toggle"),
  text("primary-foreground", "sheen:primary-hover", "primary key, hovered"),
  text("secondary-foreground", "sheen:secondary", "secondary key"),
  text("secondary-foreground", "sheen:alloy-glint+secondary", "secondary key, hovered"),
  text("secondary-foreground", "secondary-hover", "secondary hover role"),
  text("foreground", "sheen:background", "outline key"),
  text("foreground", "sheen:alloy-glint+background", "outline key, hovered"),
  text("destructive-foreground", "sheen:destructive", "destructive key"),
  text("destructive-foreground", "sheen:destructive-hover", "destructive key, hovered"),
  edge("input", "background", "control edge"),
  edge("input", "card", "control edge on a card"),
  edge("ring", "background", "focus ring"),
  edge("ring", "card", "focus ring on a card"),
  edge("faint-foreground", "background", "dither track"),
  edge("primary", "background", "selected key fill"),
  edge("primary", "secondary", "selected key beside a secondary key"),
  edge("signal", "background", "signal fill"),
  edge("chart-1", "background", "data color"),
  edge("chart-2", "background", "data color"),
  edge("chart-3", "background", "data color"),
  edge("chart-4", "background", "data color"),
  edge("chart-5", "background", "data color"),
]

let misses = 0
for (const theme of ["light", "dark"] as const) {
  console.log(`\n${theme}`)
  for (const pair of pairs) {
    const fg = token(`--${pair.fg}`, theme)
    const worst = Math.min(...surfaces(pair.bg, theme).map((bg) => ratio(fg, bg)))
    const ok = worst >= pair.min
    if (!ok) misses++
    console.log(
      `${ok ? "ok  " : "MISS"} ${worst.toFixed(2).padStart(6)} >= ${pair.min}  ${pair.fg} on ${pair.bg}  (${pair.why})`
    )
  }
}

if (outOfGamut.size) {
  console.log(`\nclipped to sRGB: ${[...outOfGamut].join(", ")}`)
}
console.log(misses ? `\n${misses} pair(s) below minimum` : "\nall pairs pass")
process.exit(misses ? 1 : 0)
