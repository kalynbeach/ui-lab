import Link from "next/link"

const pages = [
  {
    href: "/theme",
    title: "Theme",
    description: "Kevelle's colors, type, alloy keys, and dither.",
  },
]

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-11 sm:px-6">
      <h1 className="type-display">Pages</h1>
      <div className="mt-2 beam text-signal" aria-hidden="true" />
      <ul className="mt-11 border-t">
        {pages.map((page) => (
          <li key={page.href} className="border-b">
            <Link
              href={page.href}
              className="flex flex-col gap-1 py-4 hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-baseline sm:gap-6 sm:px-2"
            >
              <span className="type-label sm:w-32">{page.title}</span>
              <span className="type-body text-muted-foreground">
                {page.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
