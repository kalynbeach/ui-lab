import type { Metadata } from "next"

import { Showcase } from "./showcase"

export const metadata: Metadata = {
  title: "UI",
  description: "Kevelle's parts on UI SDK, in every state.",
}

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-11 px-4 py-11 sm:px-6">
      <header>
        <h1 className="type-display">UI</h1>
        <div className="mt-2 beam text-signal" aria-hidden="true" />
      </header>
      <Showcase />
    </main>
  )
}
