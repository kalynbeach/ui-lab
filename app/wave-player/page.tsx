import type { Metadata } from "next"

import { WavePlayerCard } from "@/components/wave-player/card"

import { AddFiles } from "./add-files"

export const metadata: Metadata = {
  title: "WavePlayer",
  description: "The WavePlayer card on UI SDK parts.",
}

export default function WavePlayerPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-11 sm:px-6">
      <WavePlayerCard />
      <AddFiles />
    </main>
  )
}
