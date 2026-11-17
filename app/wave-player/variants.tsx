// Every WavePlayer variant the gallery offers, in its order. Each id is also
// the variant's route under /wave-player. Server pages call `render`, so this
// module stays free of "use client".

import Link from "next/link"
import * as React from "react"

import { WavePlayerBar } from "@/components/wave-player/bar"
import { WavePlayerCard } from "@/components/wave-player/card"
import { WavePlayerMini } from "@/components/wave-player/mini"
import { FRAME_MOTION } from "@/components/wave-player/morph"
import { WavePlayerPlaylist } from "@/components/wave-player/playlist-view"
import { WavePlayerWithPlaylist } from "@/components/wave-player/with-playlist"

export type WavePlayerVariant = {
  readonly id: string
  readonly label: string
  readonly render: () => React.ReactNode
}

export const VARIANTS = [
  { id: "card", label: "Card", render: () => <WavePlayerCard /> },
  {
    id: "mini",
    label: "Mini",
    render: () => <WavePlayerMini expand={<Link href="/wave-player?variant=card" />} />,
  },
  {
    id: "bar",
    label: "Bar",
    render: () => (
      <div className="w-full max-w-2xl">
        <WavePlayerBar />
      </div>
    ),
  },
  { id: "with-playlist", label: "Card + Playlist", render: () => <WavePlayerWithPlaylist /> },
  { id: "playlist", label: "Playlist", render: () => <Playlist /> },
] as const satisfies readonly WavePlayerVariant[]

export type VariantId = (typeof VARIANTS)[number]["id"]

// An unknown id, such as one from an old link, falls back to the first variant.
export function findVariant(id: string | null | undefined): (typeof VARIANTS)[number] {
  return VARIANTS.find((variant) => variant.id === id) ?? VARIANTS[0]
}

// The Playlist has no frame, so it brings its own teleport. The reduced-motion
// rule in the frame's CSS stops it.
function Playlist() {
  return (
    <React.ViewTransition {...FRAME_MOTION} default="none">
      <div className="w-full max-w-85 bg-card text-card-foreground shadow-surface ring-1 ring-foreground/10">
        <WavePlayerPlaylist heading={<h2>Playlist</h2>} />
      </div>
    </React.ViewTransition>
  )
}
