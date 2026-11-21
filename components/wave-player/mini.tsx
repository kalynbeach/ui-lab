"use client"

import * as React from "react"
import { ArrowsOutSimpleIcon } from "@phosphor-icons/react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { WavePlayerFrame } from "./frame"
import {
  WavePlayerByline,
  WavePlayerScreen,
  WavePlayerSettings,
  WavePlayerTitle,
  WavePlayerTransport,
} from "./parts"
import { WavePlayerClock, WavePlayerSeek } from "./seek"

// The screen sits beside the time and the transport while the small transport
// fits there: 204px of content on a fine pointer. A narrower mini, or a coarse
// pointer's 44px keys, moves the transport to its own row under the screen.
const STACKED = "@max-[12.75rem]:col-span-2 pointer-coarse:col-span-2"
const BESIDE = "row-span-2 @max-[12.75rem]:row-span-1 pointer-coarse:row-span-1"

export function WavePlayerMini({
  expand,
  className,
}: {
  // The element Open player renders, such as <Link href="/wave-player" />.
  readonly expand?: React.ReactElement<Record<string, unknown>>
  readonly className?: string
}) {
  return (
    <WavePlayerFrame
      kind="mini"
      className={cn(
        "@container flex w-60 max-w-full flex-col gap-3 bg-card p-3 text-card-foreground shadow-surface ring-1 ring-foreground/10",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <WavePlayerTitle className="pt-0.5" />
          <WavePlayerByline />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <WavePlayerSettings size="sm" />
          {expand ? <OpenPlayer link={expand} /> : null}
        </div>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
        <WavePlayerScreen className={cn("size-18", BESIDE)} />
        <WavePlayerClock className="self-start" />
        <WavePlayerTransport size="sm" className={cn("self-end", STACKED)} />
      </div>
      <WavePlayerSeek appearance="line" />
    </WavePlayerFrame>
  )
}

function OpenPlayer({ link }: { readonly link: React.ReactElement<Record<string, unknown>> }) {
  return (
    <Tooltip type="label">
      <TooltipTrigger
        render={
          <Button variant="secondary" size="icon-sm" render={link} aria-label="Open player" />
        }
      >
        <ArrowsOutSimpleIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent data-agent-hidden="">Open player</TooltipContent>
    </Tooltip>
  )
}
