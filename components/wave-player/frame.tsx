"use client"

import * as React from "react"
import { useShortcut } from "@ui-sdk/react/shortcuts"
import { cn } from "cn"

import { usePlayer, usePlayerStore } from "./context"
import type { PlayerCommand, PlayerState } from "./model"
import { frameMotion, frameWraps, type FrameKind, type MountMotion } from "./morph"
import type { Repeat } from "./settings"
import "./wave-player.css"

const REPEAT_CYCLE = { off: "all", all: "one", one: "off" } as const satisfies Record<Repeat, Repeat>

// Each command reads the snapshot when its key arrives, so a setting it flips
// is never stale.
export const PLAYER_KEYS = {
  n: { description: "Next track", command: () => ({ type: "next" }) },
  p: { description: "Previous track", command: () => ({ type: "previous" }) },
  m: {
    description: "Mute",
    command: (state) => ({ type: "set-muted", muted: !state.settings.muted }),
  },
  s: {
    description: "Shuffle",
    command: (state) => ({ type: "set-shuffle", shuffle: !state.settings.shuffle }),
  },
  r: {
    description: "Repeat",
    command: (state) => ({ type: "set-repeat", repeat: REPEAT_CYCLE[state.settings.repeat] }),
  },
  t: {
    description: "Remaining time",
    command: (state) => ({
      type: "set-time",
      time: state.settings.time === "elapsed" ? "remaining" : "elapsed",
    }),
  },
} as const satisfies Record<
  string,
  { readonly description: string; readonly command: (state: PlayerState) => PlayerCommand }
>

export type PlayerKey = keyof typeof PLAYER_KEYS

// A letter typed in the Playlist finds a row by its title instead.
const outsidePlaylist = () => !document.activeElement?.closest("[role=grid]")

function useLetterKey(key: PlayerKey) {
  const store = usePlayerStore("WavePlayerFrame")
  const { description, command } = PLAYER_KEYS[key]

  useShortcut(key, () => store.send(command(store.getSnapshot())), {
    description,
    when: outsidePlaylist,
  })
}

// Space belongs to a focused button, toggle, link, or field, as the ARIA
// patterns require. The Seek thumb's range input does not use Space, so it
// toggles playback there, as it does on a Playlist row or the frame itself.
const OWNS_SPACE =
  'button, a[href], input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"]'

export const SEEK_THUMB = "data-wave-player-seek"

function spaceToggles(event: React.KeyboardEvent): boolean {
  if (
    event.key !== " " ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.defaultPrevented
  )
    return false

  const target = event.target

  if (!(target instanceof Element)) return true

  return target.closest(`[${SEEK_THUMB}]`) !== null || target.closest(OWNS_SPACE) === null
}

export function WavePlayerFrame({
  kind,
  className,
  children,
}: {
  readonly kind: FrameKind
  readonly className?: string
  readonly children: React.ReactNode
}) {
  const store = usePlayerStore("WavePlayerFrame")
  const status = usePlayer((state) =>
    state.current === null
      ? "empty"
      : state.status.kind === "failed"
        ? `failed-${state.status.reason}`
        : state.status.kind
  )
  const motion = useMountMotion()
  const [wraps] = React.useState(() => frameWraps(motion))

  useLetterKey("n")
  useLetterKey("p")
  useLetterKey("m")
  useLetterKey("s")
  useLetterKey("r")
  useLetterKey("t")

  const frame = (
    // The region takes focus from a click on its body, so Space reaches it, without adding a tab stop.
    <section
      aria-label="WavePlayer"
      tabIndex={-1}
      data-slot="wave-player"
      data-kind={kind}
      data-status={status}
      onKeyDown={(event) => {
        if (!spaceToggles(event)) return

        event.preventDefault()
        store.send({ type: "toggle" })
      }}
      className={cn("outline-none", className)}
    >
      {children}
    </section>
  )

  return wraps ? (
    <React.ViewTransition {...frameMotion(motion)} default="none">
      {frame}
    </React.ViewTransition>
  ) : (
    frame
  )
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

function useMountMotion(): MountMotion {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    () => (matchMedia(REDUCED_MOTION).matches ? "reduced" : "full"),
    () => "unknown"
  )
}

function subscribeReducedMotion(listener: () => void): () => void {
  const query = matchMedia(REDUCED_MOTION)

  query.addEventListener("change", listener)

  return () => query.removeEventListener("change", listener)
}
