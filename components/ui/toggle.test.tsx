import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ShuffleIcon } from "@phosphor-icons/react"
import * as React from "react"
import { expect, test, vi } from "vitest"

import { Toggle, ToggleGroup, ToggleIcon } from "./toggle"

test("a toggle keeps its name and reports on through aria-pressed", async () => {
  const onPressedChange = vi.fn()
  render(
    <Toggle size="icon" aria-label="Shuffle" onPressedChange={onPressedChange}>
      <ToggleIcon>
        <ShuffleIcon />
      </ToggleIcon>
    </Toggle>
  )
  const toggle = screen.getByRole("button", { name: "Shuffle" })

  expect(toggle.getAttribute("aria-pressed")).toBe("false")
  expect(toggle.hasAttribute("data-pressed")).toBe(false)

  await userEvent.tab()
  await userEvent.keyboard(" ")

  expect(onPressedChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "press" }))
  expect(toggle.getAttribute("aria-pressed")).toBe("true")
  expect(toggle.hasAttribute("data-pressed")).toBe(true)
  expect(screen.getByRole("button", { name: "Shuffle" })).toBe(toggle)

  await userEvent.keyboard("{Enter}")
  expect(toggle.getAttribute("aria-pressed")).toBe("false")
})

function Repeat({ onChange }: { onChange: (value: string[]) => void }) {
  const [value, setValue] = React.useState<string[]>([])

  return (
    <ToggleGroup
      aria-label="Repeat"
      spacing={0}
      value={value}
      onValueChange={(next) => {
        onChange(next)
        setValue(next)
      }}
    >
      <Toggle value="all">All</Toggle>
      <Toggle value="one">One</Toggle>
    </ToggleGroup>
  )
}

test("a toggle group is one tab stop, arrows move focus without pressing, and one toggle stays pressed", async () => {
  const onChange = vi.fn()
  render(<Repeat onChange={onChange} />)
  const group = screen.getByRole("group", { name: "Repeat" })
  const all = screen.getByRole("button", { name: "All" })
  const one = screen.getByRole("button", { name: "One" })

  expect(group.dataset.spacing).toBe("0")
  expect([all, one].filter((item) => item.tabIndex === 0)).toHaveLength(1)

  await userEvent.tab()
  expect(document.activeElement).toBe(all)
  await userEvent.keyboard("{ArrowRight}")
  expect(document.activeElement).toBe(one)
  expect(onChange).not.toHaveBeenCalled()

  await userEvent.keyboard(" ")
  expect(onChange).toHaveBeenLastCalledWith(["one"])
  expect(one.getAttribute("aria-pressed")).toBe("true")

  await userEvent.keyboard("{ArrowLeft}")
  await userEvent.keyboard("{Enter}")
  expect(onChange).toHaveBeenLastCalledWith(["all"])
  expect(one.getAttribute("aria-pressed")).toBe("false")
})

test("toggles in a group take the group's size and the value face", () => {
  render(
    <ToggleGroup aria-label="Grid" size="sm">
      <Toggle value="beat">Beat</Toggle>
    </ToggleGroup>
  )
  const toggle = screen.getByRole("button", { name: "Beat" })

  expect(toggle.classList.contains("h-7")).toBe(true)
  expect(toggle.className).toContain("type-pixel")
})
