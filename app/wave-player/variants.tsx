// Every WavePlayer variant the gallery offers, in its order. Each id is also
// the variant's route under /wave-player. Server pages call `render`, so this
// module stays free of "use client".

import Link from "next/link"
import * as React from "react"

import { WavePlayerBar } from "@/components/wave-player/bar"
import { WavePlayerCard } from "@/components/wave-player/card"
import { WavePlayerFrame } from "@/components/wave-player/frame"
import { WavePlayerMini } from "@/components/wave-player/mini"
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

// The Playlist sits in a frame of its own, so Space and the player's keys keep working with no card on the page.
function Playlist() {
  return (
    <WavePlayerFrame
      kind="playlist"
      className="w-full max-w-85 bg-card text-card-foreground shadow-surface ring-1 ring-foreground/10"
    >
      <WavePlayerPlaylist heading={<h2>Playlist</h2>} />
    </WavePlayerFrame>
  )
}
