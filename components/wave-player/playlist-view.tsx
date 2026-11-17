"use client"

import * as React from "react"
import { PlayIcon } from "@phosphor-icons/react"
import { cn } from "cn"

import { buttonVariants } from "@/components/ui/button"

import { usePlayer, usePlayerStore } from "./context"
import { formatClock, formatCount } from "./format"
import type { PlaylistItem } from "./playlist-grid"
import { PlaylistGrid } from "./playlist-parts"
import type { PlayerState } from "./model"

const NAME = "WavePlayerPlaylist"

const selectTracks = (state: PlayerState) => state.tracks
const selectSelected = (state: PlayerState) => state.selected
const selectCurrent = (state: PlayerState) => state.current?.track.id ?? null
const selectPlaying = (state: PlayerState) => state.status.kind === "playing"

// The host passes the heading, so it picks the heading level.
export function WavePlayerPlaylist({
  heading,
  className,
}: {
  readonly heading: React.ReactNode
  readonly className?: string
}) {
  const store = usePlayerStore(NAME)
  const tracks = usePlayer(selectTracks, NAME)
  const selected = usePlayer(selectSelected, NAME)
  const current = usePlayer(selectCurrent, NAME)
  const playing = usePlayer(selectPlaying, NAME)
  const headingId = React.useId()

  React.useEffect(() => store.retain("durations"), [store])

  const items = React.useMemo<readonly PlaylistItem[]>(
    () =>
      tracks.map((track) => ({
        value: track.id,
        label: track.title,
        hidden: track.source === "file",
      })),
    [tracks]
  )

  return (
    <div className={cn("flex w-full flex-col", className)}>
      <div className="flex min-h-13 items-center gap-2 pt-0.5 pr-3 pl-4">
        <div id={headingId} className="type-label text-foreground">
          {heading}
        </div>
        <span
          aria-hidden="true"
          className="type-pixel text-muted-foreground tabular-nums"
        >
          {formatCount(tracks.length)}
        </span>
      </div>
      {tracks.length === 0 ? (
        <p className="px-4 pt-2 pb-4 type-body text-muted-foreground">
          No tracks yet.
        </p>
      ) : (
        <PlaylistGrid.Root
          aria-labelledby={headingId}
          items={items}
          selected={selected}
          current={current}
          playing={playing}
          onSelectedChange={(id) => store.send({ type: "select-track", id })}
          onPlay={(id) => store.send({ type: "play-track", id })}
          className="flex flex-col border-t border-border"
        >
          {tracks.map((track, index) => (
            <PlaylistGrid.Row
              key={track.id}
              value={track.id}
              className={cn(
                "group/row relative grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border",
                "transition-[background-color] hover:bg-muted/60",
                "data-selected:alloy-key data-selected:hover:bg-secondary"
              )}
            >
              <PlaylistGrid.Track
                className={cn(
                  "flex min-h-10 cursor-pointer items-center gap-3 py-2 pr-2 pl-4 outline-none pointer-coarse:min-h-11",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                )}
              >
                <span className="min-w-5 shrink-0 type-pixel text-muted-foreground tabular-nums group-data-current/row:text-signal">
                  {formatCount(index + 1)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="type-body wrap-break-word text-foreground">
                    {track.title}
                  </span>
                  {track.artist === null ? null : (
                    <span className="type-caption wrap-break-word text-muted-foreground">
                      {track.artist}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="led hidden shrink-0 group-data-playing/row:block"
                />
                <span className="shrink-0 type-pixel text-muted-foreground tabular-nums group-data-current/row:text-signal">
                  {formatClock(track.duration)}
                </span>
              </PlaylistGrid.Track>
              <PlaylistGrid.PlayCell
                className={cn(
                  "flex items-center pr-2 opacity-0 transition-opacity",
                  "group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100"
                )}
              >
                <PlaylistGrid.Play
                  label={track.title}
                  className={buttonVariants({
                    variant: "secondary",
                    size: "icon-sm",
                  })}
                >
                  <PlayIcon weight="fill" aria-hidden="true" />
                </PlaylistGrid.Play>
              </PlaylistGrid.PlayCell>
            </PlaylistGrid.Row>
          ))}
        </PlaylistGrid.Root>
      )}
    </div>
  )
}
