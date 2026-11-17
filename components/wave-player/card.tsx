"use client"

import { cn } from "cn"

import { WavePlayerFrame } from "./frame"
import {
  WavePlayerByline,
  WavePlayerDuration,
  WavePlayerIndex,
  WavePlayerRepeat,
  WavePlayerScreen,
  WavePlayerShuffle,
  WavePlayerStatus,
  WavePlayerTitle,
  WavePlayerTransport,
  WavePlayerVolume,
} from "./parts"
import { WavePlayerSeek, WavePlayerTime } from "./seek"

export function WavePlayerCard({ className }: { readonly className?: string }) {
  return (
    <WavePlayerFrame
      kind="card"
      className={cn(
        "flex w-full max-w-85 flex-col gap-3 bg-card p-3 text-card-foreground shadow-surface ring-1 ring-foreground/10",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <WavePlayerTitle className="pt-0.5" />
        <div className="flex min-h-6 shrink-0 items-center gap-2">
          <WavePlayerStatus />
          <WavePlayerDuration />
        </div>
      </div>
      <WavePlayerScreen className="w-full" />
      <div className="flex min-h-4 items-start justify-between gap-3">
        <WavePlayerByline />
        <WavePlayerIndex className="ml-auto shrink-0" />
      </div>
      <div className="flex flex-col gap-1.5">
        <WavePlayerSeek appearance="waveform" />
        <WavePlayerTime className="self-start" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
        <WavePlayerTransport />
        <div className="flex items-center gap-2">
          <WavePlayerShuffle size="sm" />
          <WavePlayerRepeat size="sm" />
          <WavePlayerVolume size="sm" />
        </div>
      </div>
    </WavePlayerFrame>
  )
}
