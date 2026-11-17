import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

import { Kbd } from "./kbd"

test("a key renders as kbd in the value face unless face is label", () => {
  render(
    <>
      <Kbd>Space</Kbd>
      <Kbd face="label">?</Kbd>
    </>
  )
  const value = screen.getByText("Space")
  const label = screen.getByText("?")

  expect(value.tagName).toBe("KBD")
  expect(value.classList.contains("type-pixel")).toBe(true)
  expect(value.classList.contains("font-label")).toBe(false)
  expect(label.classList.contains("font-label")).toBe(true)
})
