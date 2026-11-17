"use client"

import * as React from "react"
import { ArrowUpRightIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { browser } from "react-dom"

import { buttonVariants } from "@/components/ui/button"
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control"

import { findVariant, VARIANTS, type VariantId } from "./variants"

export const VARIANT_PARAM = "variant"

// One variant at a time. The swap runs in a transition, so the leaving frame
// shrinks while the arriving one grows, and the one screen moves between them.
export function Gallery({
  variant: asked,
  onVariantChange,
}: {
  /** The variant the URL asks for. A new value swaps the shown variant. */
  readonly variant: VariantId
  readonly onVariantChange?: (id: VariantId) => void
}) {
  const [id, setId] = React.useState(asked)
  const [followed, setFollowed] = React.useState(asked)

  // A link or a history step changed the URL after mount, so the shown variant follows it.
  if (followed !== asked) {
    setFollowed(asked)
    setId(asked)
  }

  const variant = findVariant(id)

  return (
    <>
      <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
        {/* The row of five scrolls on a narrow screen. The padding keeps focus rings inside the scroller. */}
        <div className="max-w-full overflow-x-auto p-1">
          <SegmentedControl<VariantId>
            aria-label="Variant"
            size="default"
            value={id}
            onValueChange={(next) => {
              if (!next) return

              React.startTransition(() => setId(next))
              onVariantChange?.(next)
            }}
          >
            {VARIANTS.map((entry) => (
              <SegmentedControlItem key={entry.id} value={entry.id}>
                {entry.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
        <Link
          href={`/wave-player/${variant.id}`}
          aria-label={`${variant.label} on its own page`}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <ArrowUpRightIcon aria-hidden="true" />
        </Link>
      </div>
      <React.Fragment key={variant.id}>{variant.render()}</React.Fragment>
    </>
  )
}

// The variant lives in the URL, so a reload or a shared link keeps it.
// Suspending on browser() first keeps the prerender from reaching
// useSearchParams, which Next reports as an error even inside Suspense.
export function GalleryFromUrl() {
  React.use(browser("The variant comes from the URL."))
  const params = useSearchParams()

  return (
    <Gallery
      variant={findVariant(params.get(VARIANT_PARAM)).id}
      onVariantChange={(id) => {
        const url = new URL(window.location.href)

        url.searchParams.set(VARIANT_PARAM, id)
        window.history.replaceState(null, "", url)
      }}
    />
  )
}
