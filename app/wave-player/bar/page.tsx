import type { Metadata } from "next"
import Link from "next/link"

import { WavePlayerBar } from "@/components/wave-player/bar"

export const metadata: Metadata = {
  title: "Bar",
  description: "The WavePlayer bar.",
}

export default function Page() {
  return (
    <main className="flex flex-1 flex-col items-center gap-11 px-4 pt-11 pb-40 sm:px-6">
      <nav aria-label="Variants" className="flex gap-4 type-label">
        <Link href="/wave-player" className="text-muted-foreground hover:text-foreground">
          Card
        </Link>
        <Link href="/wave-player/mini" className="text-muted-foreground hover:text-foreground">
          Mini
        </Link>
        <Link href="/wave-player/bar" aria-current="page">
          Bar
        </Link>
      </nav>
      <WavePlayerBar className="fixed inset-x-3 bottom-3 z-10 mx-auto w-auto max-w-2xl" />
    </main>
  )
}
