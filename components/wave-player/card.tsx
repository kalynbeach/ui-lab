"use client"

import { cn } from "cn"

import { WavePlayerFrame } from "./frame"
import {
  WavePlayerByline,
  WavePlayerIndex,
  WavePlayerRepeat,
  WavePlayerScreen,
  WavePlayerShuffle,
  WavePlayerTitle,
  WavePlayerTransport,
  WavePlayerVolume,
} from "./parts"
import { WavePlayerElapsed, WavePlayerRemaining, WavePlayerSeek } from "./seek"

// The transport stays centered, with the smaller keys on either side. Under
// 312px, and on a coarse pointer, where every key is 44px, the smaller keys
// move to a second row, so nothing overlaps.
export function WavePlayerControls({ className }: { readonly className?: string }) {
  return (
    <div className={cn("@container", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-3 pointer-coarse:grid-cols-[auto_auto] pointer-coarse:justify-center @max-[19.5rem]:grid-cols-[auto_auto] @max-[19.5rem]:justify-center">
        <div className="flex items-center gap-2 justify-self-start pointer-coarse:order-2 @max-[19.5rem]:order-2">
          <WavePlayerShuffle size="sm" />
          <WavePlayerVolume size="sm" />
        </div>
        <WavePlayerTransport className="pointer-coarse:order-1 pointer-coarse:col-span-2 pointer-coarse:justify-self-center @max-[19.5rem]:order-1 @max-[19.5rem]:col-span-2 @max-[19.5rem]:justify-self-center" />
        <div className="justify-self-end pointer-coarse:order-3 @max-[19.5rem]:order-3">
          <WavePlayerRepeat size="sm" />
        </div>
      </div>
    </div>
  )
}

export function WavePlayerCard({ className }: { readonly className?: string }) {
  return (
    <WavePlayerFrame
      kind="card"
      className={cn(
        "flex w-full max-w-85 flex-col gap-3 bg-card p-3 text-card-foreground shadow-surface ring-1 ring-foreground/10",
        className
      )}
    >
      <WavePlayerTitle className="min-h-6 pt-0.5" />
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
    </WavePlayerFrame>
  )
}
