import type { Metadata } from "next"
import { Geist } from "next/font/google"
import Link from "next/link"
import { preload } from "react-dom"
import { ColorSchemeControl, ColorSchemePreferences } from "./theme/color-scheme"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: { default: "ui-lab", template: "%s | ui-lab" },
  description: "Interface experiments built on UI SDK.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  preload("/fonts/departure-mono/DepartureMono-Regular.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  })

  return (
    <html
      lang="en"
      data-color-scheme="system"
      className={geistSans.variable}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col">
        <ColorSchemePreferences>
          <header className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
            <Link
              href="/"
              className="type-wordmark focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              ui-lab
            </Link>
            <ColorSchemeControl />
          </header>
          {children}
        </ColorSchemePreferences>
      </body>
    </html>
  )
}
