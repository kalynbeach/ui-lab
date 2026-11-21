"use client"

// The control is "Open Playlist", not "Playlist", because agents match names by
// whole words and the grid is "Playlist". The open panel shares the grid's name;
// agents tell them apart by action (setOpen against select and play).
//
// WavePlayerCard takes no extra control, so this lays out the card's parts
// again with the Playlist control among the utilities.

import * as React from "react"
import { PlaylistIcon, XIcon } from "@phosphor-icons/react"
import { cn } from "cn"

import { buttonVariants } from "@/components/ui/button"
import { Dialog, DialogClose, DialogPanel, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

import { WavePlayerFrame } from "./frame"
import {
  WavePlayerByline,
  WavePlayerIndex,
  WavePlayerScreen,
  WavePlayerTitle,
} from "./parts"
import { WavePlayerControls } from "./card"
import { WavePlayerElapsed, WavePlayerRemaining, WavePlayerSeek } from "./seek"
import { WavePlayerPlaylist } from "./playlist-view"

// The card (max-w-85) plus a gap-6 and a w-80 Playlist on each side, in rem.
// The `@min-[64.25rem]` container queries below use the same width.
const WIDE_REM = 21.25 + 2 * (1.5 + 20)

const SURFACE = "bg-card text-card-foreground shadow-surface ring-1 ring-foreground/10"

const OPEN_PLAYLIST = 'button[aria-label="Open Playlist"]'

export function WavePlayerWithPlaylist({ className }: { readonly className?: string }) {
  const root = React.useRef<HTMLDivElement>(null)
  const beside = React.useRef<HTMLDivElement>(null)
  const panelOpen = React.useRef(false)
  // A new width hides one part: Open Playlist when wide, the Playlist beside
  // the card when narrow. This is set when that part held the focus.
  const hiddenHadFocus = React.useRef(false)
  // The focus can still be on the hidden part when the width is measured.
  const noteFocus = React.useCallback((next: boolean) => {
    const hidden = next ? root.current?.querySelector(OPEN_PLAYLIST) : beside.current

    if (hidden?.contains(document.activeElement)) hiddenHadFocus.current = true
  }, [])
  const wide = useWide(root, noteFocus)

  // The part that held the focus is gone: the hidden part, or an open panel
  // that turning wide unmounts. The focus moves to the Playlist's place in the
  // new layout, unless another element has taken it since.
  React.useEffect(() => {
    if (wide === null) return

    const hidden = hiddenHadFocus.current && document.activeElement === document.body
    const panel = wide && panelOpen.current

    hiddenHadFocus.current = false
    if (wide) panelOpen.current = false
    if (!hidden && !panel) return

    root.current?.querySelector<HTMLElement>(wide ? '[role="grid"] [tabindex="0"]' : OPEN_PLAYLIST)?.focus()
  }, [wide])

  return (
    <WavePlayerFrame kind="card" className={cn("@container w-full", className)}>
      <div
        ref={root}
        // Chrome drops the focus from either part as soon as the part is
        // hidden, most often before the width is measured. No element receives it.
        onBlur={(event) => {
          const from = event.target
          const part = beside.current?.contains(from) || from.closest(OPEN_PLAYLIST) !== null

          if (part && event.relatedTarget === null && from.getClientRects().length === 0) {
            hiddenHadFocus.current = true
          }
        }}
        className="grid w-full justify-items-center gap-6 @min-[64.25rem]:grid-cols-[1fr_auto_1fr] @min-[64.25rem]:items-start"
      >
        <div
          className={cn(
            "flex w-full max-w-85 flex-col gap-3 p-3 @min-[64.25rem]:col-start-2 @min-[64.25rem]:w-85",
            SURFACE
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <WavePlayerTitle className="pt-0.5" />
            <div className="flex min-h-6 shrink-0 items-center">
              {wide === true ? null : (
                <PlaylistPanel
                  className="@min-[64.25rem]:hidden"
                  onOpenChange={(open) => {
                    panelOpen.current = open
                  }}
                />
              )}
            </div>
          </div>
          <WavePlayerScreen className="w-full" />
          <div className="flex min-h-4 items-start justify-between gap-3">
            <WavePlayerByline />
            <WavePlayerIndex className="ml-auto shrink-0" />
          </div>
          <div className="flex flex-col gap-1">
            <WavePlayerSeek appearance="waveform" />
            <div className="flex h-4 items-center justify-between gap-2">
              <WavePlayerElapsed />
              <WavePlayerRemaining />
            </div>
          </div>
          <WavePlayerControls />
        </div>
        {wide === false ? null : (
          <div ref={beside} className={cn("hidden w-80 justify-self-start @min-[64.25rem]:block", SURFACE)}>
            <WavePlayerPlaylist heading={<h2>Playlist</h2>} />
          </div>
        )}
      </div>
    </WavePlayerFrame>
  )
}

function PlaylistPanel({
  className,
  onOpenChange,
}: {
  readonly className?: string
  readonly onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger
        aria-label="Open Playlist"
        className={cn(buttonVariants({ variant: "secondary", size: "icon-sm" }), className)}
      >
        <PlaylistIcon aria-hidden="true" />
      </DialogTrigger>
      <DialogPanel initialFocus={'[role="grid"] [tabindex="0"]'}>
        <WavePlayerPlaylist heading={<DialogTitle>Playlist</DialogTitle>} />
        <DialogClose
          aria-label="Close"
          className={cn(
            buttonVariants({ variant: "secondary", size: "icon-sm" }),
            "absolute end-3 top-3"
          )}
        >
          <XIcon aria-hidden="true" />
        </DialogClose>
      </DialogPanel>
    </Dialog>
  )
}

// Container queries lay out the server markup, which holds both the Playlist
// control and the Playlist. Once measured, only the one in use stays mounted,
// so agents and screen readers find one Playlist.
function useWide(
  root: React.RefObject<HTMLElement | null>,
  /** Runs with each measurement, before React renders the layout for it. */
  onMeasure: (wide: boolean) => void
): boolean | null {
  const [wide, setWide] = React.useState<boolean | null>(null)

  React.useLayoutEffect(() => {
    const element = root.current

    if (!element) return

    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const next = element.clientWidth >= WIDE_REM * rem

      onMeasure(next)
      setWide(next)
    }
    const observer = new ResizeObserver(measure)

    measure()
    observer.observe(element)

    return () => observer.disconnect()
  }, [root, onMeasure])

  return wide
}
