import type { Metadata } from "next"

import { WavePlayerPlaylist } from "@/components/wave-player/playlist-view"

export const metadata: Metadata = {
  title: "Playlist",
}

export default function Page() {
  return <WavePlayerPlaylist heading={<h1>Playlist</h1>} />
}
