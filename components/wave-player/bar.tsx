"use client"

import { cn } from "cn"

import { Skeleton } from "@/components/ui/skeleton"

import { usePlayer } from "./context"
import { WavePlayerFrame } from "./frame"
import {
  WavePlayerScreen,
  WavePlayerSettings,
  WavePlayerTitle,
  WavePlayerTransport,
} from "./parts"
import { WavePlayerClock, WavePlayerProgress } from "./seek"

// The host's className places the bar. Fixed with insets, it also needs
// w-auto, since the bar's w-full would win over the insets. The frame stays
// mounted while the tracks load, so the skeleton holds the same box.
export function WavePlayerBar({ className }: { readonly className?: string }) {
  const loading = usePlayer((state) => state.tracks.length === 0)

  return (
    <WavePlayerFrame
      kind="bar"
      className={cn(
        "flex w-full flex-col gap-3 bg-card p-3 text-card-foreground shadow-surface ring-1 ring-foreground/10",
        className
      )}
    >
      {loading ? (
        <BarSkeleton />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <WavePlayerScreen className="size-9" />
            <div className="@container flex min-w-0 flex-1 flex-col items-start gap-1">
              <WavePlayerTitle />
              <WavePlayerClock className="@max-[5.75rem]:[&>[data-slot=wave-player-clock-duration]]:hidden" />
            </div>
            <WavePlayerTransport size="sm" className="shrink-0" />
            <WavePlayerSettings size="sm" className="shrink-0" />
          </div>
          <WavePlayerProgress />
        </>
      )}
    </WavePlayerFrame>
  )
}

function BarSkeleton() {
  return (
    <>
      <span className="sr-only">Loading tracks</span>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <Skeleton className="h-5 w-full max-w-32" />
          <Skeleton className="h-4 w-22" />
        </div>
        <Skeleton className="h-8 w-30 shrink-0" />
        <Skeleton className="size-7 shrink-0" />
      </div>
      <Skeleton className="h-0.75 w-full" />
    </>
  )
}
