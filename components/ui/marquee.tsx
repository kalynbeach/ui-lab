"use client"

/*
 * kevelle/marquee: one line of plain text that never wraps and never
 * changes its parent's height or width. It fills the slot it gets in a
 * block, grid, or flex parent, so a caller passes no sizing classes.
 *
 *   import { Marquee } from "@/components/ui/marquee"
 *
 *   <CardTitle><Marquee>{track.title}</Marquee></CardTitle>
 *
 *   <Button variant="ghost" className="w-full justify-between">
 *     <Marquee play={current ? "always" : "hover"}>{track.title}</Marquee>
 *     <span className="shrink-0">{duration}</span>
 *   </Button>
 *
 * A title that fits sits still. One that overflows rests on an ellipsis.
 * While it plays, it holds 2s on the ellipsis, crossfades to the clipped
 * text on the small step, and scrolls at 2em a second on linear until a
 * second copy, 2em behind, lands where the title began. The ellipsis then
 * crossfades back on the small step, and the pass repeats. Only the tail
 * changes in each crossfade, so the shared glyphs never dim or move.
 *
 * `play` decides when a pass runs. "always", the default, runs whenever the
 * text overflows. "hover" runs only while the host is hovered by a mouse or
 * pen, or holds keyboard focus. The host is the nearest link, button, or
 * element with a tabindex around the part. A change of `play` never
 * restarts a pass that keeps running.
 *
 * A stop during the hold is instant, since nothing has moved. A stop
 * mid-pass freezes the text and crossfades back to the ellipsis on the
 * large step. A pass runs only while at least 90% of the slot is on screen
 * and the tab is visible, and never under reduced motion, where the title
 * rests on its ellipsis. The full title stays in the accessible name, and
 * the moving copies are aria-hidden.
 *
 * The loop runs on the Web Animations API with Kevelle's --duration-small,
 * --duration-large, and --ease-out read from the page. Kevelle's DESIGN.md
 * records it under Motion as the second loop outside the curve.
 * kevelle.css's reduced-motion block can't reach a Web Animation, so the
 * part reads the preference itself.
 */

import * as React from "react"
import { cn } from "cn"

/** The rest on the ellipsis at the start of every pass, the first included. */
const HOLD_MS = 2000

/** Travel speed in the text's own em per second: 32px a second at 16px. */
const SPEED_EM_PER_S = 2

/** The share of the slot that must be on screen for a pass to run. */
const SEEN_RATIO = 0.9

type MarqueePlay = "always" | "hover"

/** Geometry read from the live layout. */
type Probe = {
  /** The slot's inline size, px. */
  readonly slot: number
  /** The text's natural inline size, px. */
  readonly natural: number
  /** Signed px from the title's start to the copy's start, gap included. Negative in rtl. */
  readonly travel: number
  /** The text's font size, px, so speed reads in em. */
  readonly em: number
}

/** The conditions that let a pass run, each kept by its own observer. */
type Gate = {
  readonly reduced: boolean
  readonly seen: boolean
  readonly engaged: boolean
}

/** Kevelle's motion tokens, read from the page. Without them the crossfades are instant. */
type Tokens = {
  readonly fade: number
  readonly settle: number
  readonly easing: string
}

type ScrollPlan = {
  readonly kind: "scroll"
  readonly slot: number
  readonly travel: number
  readonly duration: number
  readonly track: Keyframe[]
  readonly text: Keyframe[]
}

/**
 * What the text should do. "snap" rests at once: the text fits, motion is
 * reduced, or the slot is out of sight. "settle" may crossfade back first:
 * the part is only disengaged.
 */
type Plan =
  | { readonly kind: "rest"; readonly stop: "snap" | "settle" }
  | ScrollPlan

type Phase =
  | { readonly kind: "rest" }
  | {
      readonly kind: "scroll"
      readonly plan: ScrollPlan
      readonly animations: readonly Animation[]
    }
  | { readonly kind: "settling"; readonly animations: readonly Animation[] }

function Marquee({
  children,
  play = "always",
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  /** Plain text. The part draws hidden copies of it, so it takes no markup. */
  children: string
  /** "always" plays whenever the text overflows. "hover" plays only while the host is hovered or keyboard-focused. */
  play?: MarqueePlay
}) {
  const text = React.useRef<HTMLSpanElement>(null)
  const track = React.useRef<HTMLSpanElement>(null)
  const controller = React.useRef<Controller | null>(null)
  const latest = React.useRef(play)

  // One controller per title. Its cleanup cancels the loop before paint, so
  // a new title never shows a frame at the old title's offset.
  React.useLayoutEffect(() => {
    if (!text.current || !track.current) return

    const attached = attachMarquee(text.current, track.current, latest.current)

    controller.current = attached

    return () => {
      attached.dispose()
      controller.current = null
    }
  }, [children])

  React.useLayoutEffect(() => {
    latest.current = play
    controller.current?.setPlay(play)
  }, [play])

  return (
    <span
      data-slot="marquee"
      data-play={play}
      className={cn(
        // contain-inline-size zeroes the root's min-content, so a grid track
        // or a flex row never grows to fit the title. isolate keeps the
        // layers' plus-lighter blend inside the part.
        "relative isolate block w-full min-w-0 flex-1 overflow-x-clip text-start whitespace-nowrap contain-inline-size",
        className
      )}
      {...props}
    >
      {/* The accessible text. It stays in flow, so it alone sets the line's
          height, and it shares the root's box, so the controller measures
          and observes it in the root's place. The track above it takes no
          pointer or selection, so a click or a drag lands on this text. */}
      <span
        ref={text}
        data-slot="marquee-text"
        className="block truncate mix-blend-plus-lighter"
      >
        {children}
      </span>
      <span
        ref={track}
        data-slot="marquee-track"
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 start-0 flex w-max opacity-0 mix-blend-plus-lighter select-none"
      >
        <span>{children}</span>
        <span className="ms-[2em]">{children}</span>
      </span>
    </span>
  )
}

/** A token's time in ms, or 0 when the page doesn't set it. */
function readMs(value: string) {
  const number = parseFloat(value)

  if (!Number.isFinite(number)) return 0

  return value.trim().endsWith("ms") ? number : number * 1000
}

/**
 * A pass runs only when the text overflows, motion is allowed, the slot is
 * on screen, and the part is engaged. One cycle is the hold, a fade to the
 * clipped text, the travel, and a fade back to the ellipsis with the copy
 * on the title's start, so the iteration boundary swaps identical pixels.
 */
function planMarquee(probe: Probe, gate: Gate, tokens: Tokens): Plan {
  if (probe.natural - probe.slot < 0.01 || gate.reduced || !gate.seen)
    return { kind: "rest", stop: "snap" }

  if (!gate.engaged) return { kind: "rest", stop: "settle" }

  const { fade, easing } = tokens
  const move = (Math.abs(probe.travel) / (SPEED_EM_PER_S * probe.em)) * 1000
  const duration = HOLD_MS + fade + move + fade
  const at = (ms: number) => ms / duration
  const start = "translateX(0px)"
  const end = `translateX(${-probe.travel}px)`

  return {
    kind: "scroll",
    slot: probe.slot,
    travel: probe.travel,
    duration,
    track: [
      { offset: 0, opacity: 0, transform: start },
      { offset: at(HOLD_MS), opacity: 0, transform: start, easing },
      { offset: at(HOLD_MS + fade), opacity: 1, transform: start },
      { offset: at(HOLD_MS + fade + move), opacity: 1, transform: end, easing },
      { offset: 1, opacity: 0, transform: end },
    ],
    text: [
      { offset: 0, opacity: 1 },
      { offset: at(HOLD_MS), opacity: 1, easing },
      { offset: at(HOLD_MS + fade), opacity: 0 },
      { offset: at(HOLD_MS + fade + move), opacity: 0, easing },
      { offset: 1, opacity: 1 },
    ],
  }
}

const samePass = (a: ScrollPlan, b: ScrollPlan) =>
  Math.abs(a.slot - b.slot) <= 0.5 && Math.abs(a.travel - b.travel) <= 0.5

type Controller = {
  setPlay(play: MarqueePlay): void
  dispose(): void
}

/**
 * The imperative shell. Each observer writes one field and calls update(),
 * which compares the plan with the running phase and applies only the
 * difference, so a redundant call changes nothing. React never re-renders
 * for hover, focus, or motion.
 */
function attachMarquee(
  text: HTMLElement,
  track: HTMLElement,
  initialPlay: MarqueePlay
): Controller {
  const [title, copy] = track.children
  const host = text.closest<HTMLElement>("a[href], button, [tabindex]") ?? text
  const style = getComputedStyle(text)
  const tokens: Tokens = {
    fade: readMs(style.getPropertyValue("--duration-small")),
    settle: readMs(style.getPropertyValue("--duration-large")),
    easing: style.getPropertyValue("--ease-out").trim() || "linear",
  }

  const measure = (): Probe => {
    const slot = text.getBoundingClientRect()
    const first = title.getBoundingClientRect()
    const computed = getComputedStyle(text)

    // Rects carry ancestor transforms, such as a popover scaling in, but the
    // track's translate is in the text's own CSS px, and a transform never
    // fires the ResizeObserver. So divide the ancestors' scale back out, or
    // the copy misses the seam once the scale ends.
    const layout = parseFloat(computed.width)
    const scale = layout > 0 && slot.width > 0 ? slot.width / layout : 1

    return {
      slot: slot.width / scale,
      natural: first.width / scale,
      travel: (copy.getBoundingClientRect().left - first.left) / scale,
      em: parseFloat(computed.fontSize),
    }
  }

  // Without matchMedia the preference can't be read, so nothing moves.
  const media =
    "matchMedia" in window
      ? matchMedia("(prefers-reduced-motion: reduce)")
      : null

  let play = initialPlay
  let probe = measure()
  let reduced = media?.matches ?? true
  let inView = !("IntersectionObserver" in window)
  let visible = document.visibilityState === "visible"
  let hovered = host.matches(":hover")
  let focused =
    document.activeElement !== null &&
    host.contains(document.activeElement) &&
    document.activeElement.matches(":focus-visible")
  let phase: Phase = { kind: "rest" }

  const stop = () => {
    if (phase.kind !== "rest")
      for (const animation of phase.animations) animation.cancel()

    phase = { kind: "rest" }
  }

  const start = (plan: ScrollPlan) => {
    const timing = { duration: plan.duration, iterations: Infinity }

    phase = {
      kind: "scroll",
      plan,
      animations: [
        track.animate(plan.track, timing),
        text.animate(plan.text, timing),
      ],
    }
  }

  // The paused loop supplies each fade's starting value.
  const settle = (running: Extract<Phase, { kind: "scroll" }>) => {
    for (const animation of running.animations) animation.pause()

    const timing: KeyframeAnimationOptions = {
      duration: tokens.settle,
      easing: tokens.easing,
      fill: "forwards",
    }
    const fades = [
      track.animate([{ opacity: 0 }], timing),
      text.animate([{ opacity: 1 }], timing),
    ]
    const settling: Phase = {
      kind: "settling",
      animations: [...running.animations, ...fades],
    }

    phase = settling
    fades[0].addEventListener("finish", () => {
      if (phase !== settling) return

      stop()
      update()
    })
  }

  const inHold = (running: Extract<Phase, { kind: "scroll" }>) =>
    Number(running.animations[0].currentTime ?? 0) % running.plan.duration <
    HOLD_MS

  function update() {
    const next = planMarquee(
      probe,
      {
        reduced,
        seen: inView && visible,
        engaged: play === "always" || hovered || focused,
      },
      tokens
    )

    if (phase.kind === "rest") {
      if (next.kind === "scroll") start(next)
    } else if (phase.kind === "scroll") {
      if (next.kind === "scroll") {
        if (samePass(phase.plan, next)) return

        stop()
        start(next)
      } else if (next.stop === "snap" || inHold(phase)) stop()
      else settle(phase)
    }
    // Only a snap cuts a settle short. A settle that finishes calls update()
    // again, so a part re-engaged meanwhile starts a fresh pass with its hold.
    else if (next.kind === "rest" && next.stop === "snap") stop()
  }

  const remeasure = () => {
    probe = measure()
    update()
  }

  const onMotion = () => {
    reduced = media?.matches ?? true
    update()
  }

  const onVisibility = () => {
    visible = document.visibilityState === "visible"
    update()
  }

  const onPointer = (event: PointerEvent) => {
    if (event.pointerType === "touch") return

    hovered = event.type === "pointerenter"
    update()
  }

  const onFocusIn = (event: FocusEvent) => {
    focused =
      event.target instanceof Element && event.target.matches(":focus-visible")
    update()
  }

  const onFocusOut = (event: FocusEvent) => {
    if (
      event.relatedTarget instanceof Node &&
      host.contains(event.relatedTarget)
    )
      return

    focused = false
    update()
  }

  const resize = new ResizeObserver(remeasure)

  resize.observe(text)
  resize.observe(track)

  const intersection =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            const entry = entries.at(-1)

            if (!entry) return

            inView = entry.intersectionRatio >= SEEN_RATIO
            update()
          },
          { threshold: [0, SEEN_RATIO] }
        )
      : null

  intersection?.observe(text)
  media?.addEventListener("change", onMotion)
  document.addEventListener("visibilitychange", onVisibility)
  document.fonts?.addEventListener("loadingdone", remeasure)
  host.addEventListener("pointerenter", onPointer)
  host.addEventListener("pointerleave", onPointer)
  host.addEventListener("focusin", onFocusIn)
  host.addEventListener("focusout", onFocusOut)
  update()

  return {
    setPlay(next) {
      play = next
      update()
    },
    dispose() {
      stop()
      resize.disconnect()
      intersection?.disconnect()
      media?.removeEventListener("change", onMotion)
      document.removeEventListener("visibilitychange", onVisibility)
      document.fonts?.removeEventListener("loadingdone", remeasure)
      host.removeEventListener("pointerenter", onPointer)
      host.removeEventListener("pointerleave", onPointer)
      host.removeEventListener("focusin", onFocusIn)
      host.removeEventListener("focusout", onFocusOut)
    },
  }
}

export { Marquee }
