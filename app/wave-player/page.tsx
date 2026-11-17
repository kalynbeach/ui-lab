import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { AddFiles } from "./add-files"
import { GalleryFromUrl } from "./gallery"

export const metadata: Metadata = {
  title: "WavePlayer",
  description: "Every WavePlayer variant on UI SDK parts.",
}

// The search params are known only in the browser, so the gallery renders
// there and the rest of the page stays static.
export default function WavePlayerPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-11 sm:px-6">
      <h1 className="sr-only">WavePlayer</h1>
      <Suspense
        fallback={
          <>
            <Skeleton className="h-8 w-80 max-w-full" />
            <Skeleton className="aspect-[340/540] w-full max-w-85" />
          </>
        }
      >
        <GalleryFromUrl />
      </Suspense>
      <AddFiles />
    </main>
  )
}
