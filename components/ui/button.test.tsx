import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PlayIcon } from "@phosphor-icons/react"
import { expect, test, vi } from "vitest"

import { Button } from "./button"

test("a button is named by its text, presses with Enter and Space, and passes details", async () => {
  const onClick = vi.fn()
  render(
    <Button variant="secondary" size="sm" onClick={onClick}>
      Export
    </Button>
  )
  const button = screen.getByRole("button", { name: "Export" })

  expect(button.getAttribute("type")).toBe("button")
  expect(button.dataset.variant).toBe("secondary")
  expect(button.dataset.size).toBe("sm")
  expect(button.hasAttribute("aria-disabled")).toBe(false)
  expect(button.hasAttribute("aria-busy")).toBe(false)

  await userEvent.tab()
  await userEvent.keyboard("{Enter}")
  await userEvent.keyboard(" ")

  expect(onClick).toHaveBeenCalledTimes(2)
  expect(onClick.mock.lastCall?.[1]).toHaveProperty("source")
})

test("an icon-only button takes its name from aria-label and hides the icon", () => {
  render(
    <Button size="icon" aria-label="Play">
      <PlayIcon aria-hidden="true" />
    </Button>
  )

  expect(screen.getByRole("button", { name: "Play" })).toBeTruthy()
})

test("a press that returns a promise keeps the name, shows a spinner, and ignores presses until it settles", async () => {
  let settle = () => {}
  const onClick = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)))
  render(
    <Button size="icon" aria-label="Load" onClick={onClick}>
      <PlayIcon aria-hidden="true" />
    </Button>
  )
  const button = screen.getByRole("button", { name: "Load" })

  await userEvent.click(button)
  await userEvent.click(button)

  expect(onClick).toHaveBeenCalledOnce()
  expect(button.getAttribute("aria-busy")).toBe("true")
  expect(button.hasAttribute("data-pending")).toBe(true)
  expect(button.querySelector('[data-slot="spinner"]')?.getAttribute("aria-hidden")).toBe("true")
  expect(screen.getByRole("button", { name: "Load" })).toBe(button)

  await act(async () => settle())

  expect(button.hasAttribute("aria-busy")).toBe(false)
  expect(button.querySelector('[data-slot="spinner"]')).toBeNull()
})

test("a disabled button leaves the tab order, and focusableWhenDisabled keeps it there without pressing", async () => {
  const onClick = vi.fn()
  render(
    <>
      <Button disabled onClick={onClick}>
        Off
      </Button>
      <Button disabled focusableWhenDisabled onClick={onClick}>
        Held
      </Button>
    </>
  )

  await userEvent.tab()
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Held" }))
  expect(document.activeElement?.getAttribute("aria-disabled")).toBe("true")

  await userEvent.keyboard("{Enter}")
  await userEvent.click(screen.getByRole("button", { name: "Off" }))
  expect(onClick).not.toHaveBeenCalled()
})
