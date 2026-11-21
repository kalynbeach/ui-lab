import { WavePlayerAgent } from "@/components/wave-player/agent"
import { WavePlayerProvider } from "@/components/wave-player/wave-player"

import { TRACKS } from "./tracks"

export default function WavePlayerLayout({ children }: LayoutProps<"/wave-player">) {
  return (
    <WavePlayerProvider tracks={TRACKS} keys="page">
      <WavePlayerAgent />
      {children}
    </WavePlayerProvider>
  )
}
