import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

import { Badge } from "./badge"
import { Progress, ProgressLabel, ProgressValue } from "./progress"
import { Separator } from "./separator"
import { Skeleton } from "./skeleton"
import { Spinner } from "./spinner"

test("progress reports its value, carries its size, and drops the value while indeterminate", () => {
  render(
    <>
      <Progress value={40} size="sm">
        <ProgressLabel>Loading track</ProgressLabel>
        <ProgressValue />
      </Progress>
      <Progress value={null} aria-label="Decoding" />
    </>
  )
  const loading = screen.getByRole("progressbar", { name: "Loading track" })
  const decoding = screen.getByRole("progressbar", { name: "Decoding" })

  expect(loading.getAttribute("aria-valuenow")).toBe("40")
  expect(loading.dataset.size).toBe("sm")
  expect(loading.querySelector('[data-slot="progress-indicator"]')?.getAttribute("style")).toContain("width: 40%")
  expect(decoding.hasAttribute("aria-valuenow")).toBe(false)
  expect(decoding.hasAttribute("data-indeterminate")).toBe(true)
  expect(decoding.dataset.size).toBe("default")
})

test("the spinner announces loading, the skeleton hides, the separator orients, and a badge keeps its text", () => {
  render(
    <>
      <Spinner />
      <Skeleton />
      <Separator orientation="vertical" />
      <Badge variant="success" face="label">
        Live
      </Badge>
    </>
  )

  expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy()
  expect(document.querySelector('[data-slot="skeleton"]')?.getAttribute("aria-hidden")).toBe("true")
  expect(screen.getByRole("separator").getAttribute("aria-orientation")).toBe("vertical")
  const badge = screen.getByText("Live")
  expect(badge.dataset.variant).toBe("success")
  expect(badge.classList.contains("font-label")).toBe(true)
})
