import { WavePlayerProvider } from "@/components/wave-player/wave-player"

import { TRACKS } from "./tracks"

export default function WavePlayerLayout({ children }: LayoutProps<"/wave-player">) {
  return <WavePlayerProvider tracks={TRACKS}>{children}</WavePlayerProvider>
}
