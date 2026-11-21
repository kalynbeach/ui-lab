import type { Metadata } from "next"

import { findVariant } from "../variants"

const variant = findVariant("card")

export const metadata: Metadata = { title: variant.label }

export default function Page() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-11 sm:px-6">
      <h1 className="sr-only">{variant.label}</h1>
      {variant.render()}
    </main>
  )
}
