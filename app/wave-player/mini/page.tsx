import type { Metadata } from "next"
import Link from "next/link"

import { WavePlayerMini } from "@/components/wave-player/mini"

export const metadata: Metadata = {
  title: "Mini",
  description: "The WavePlayer mini.",
}

export default function Page() {
  return (
    <main className="flex flex-1 flex-col items-center gap-11 px-4 py-11 sm:px-6">
      <nav aria-label="Variants" className="flex gap-4 type-label">
        <Link href="/wave-player" className="text-muted-foreground hover:text-foreground">
          Card
        </Link>
        <Link href="/wave-player/mini" aria-current="page">
          Mini
        </Link>
        <Link href="/wave-player/bar" className="text-muted-foreground hover:text-foreground">
          Bar
        </Link>
      </nav>
      <WavePlayerMini expand={<Link href="/wave-player" />} />
    </main>
  )
}
