import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"

import { SegmentedControl, SegmentedControlItem } from "./segmented-control"

function Look({ onValueChange }: { onValueChange: (value: string | null) => void }) {
  return (
    <SegmentedControl aria-label="Look" defaultValue="trace" onValueChange={onValueChange}>
      <SegmentedControlItem value="trace">
        <svg aria-hidden="true" />
        <span className="sr-only">Trace</span>
      </SegmentedControlItem>
      <SegmentedControlItem value="bars">
        <svg aria-hidden="true" />
        <span className="sr-only">Bars</span>
      </SegmentedControlItem>
      <SegmentedControlItem value="grid">
        <svg aria-hidden="true" />
        <span className="sr-only">Grid</span>
      </SegmentedControlItem>
    </SegmentedControl>
  )
}

test("a named radio group whose icon items are named by their text, one tab stop, arrows check as they move", async () => {
  const onValueChange = vi.fn()
  render(<Look onValueChange={onValueChange} />)
  const trace = screen.getByRole("radio", { name: "Trace" })
  const bars = screen.getByRole("radio", { name: "Bars" })
  const grid = screen.getByRole("radio", { name: "Grid" })

  expect(screen.getByRole("radiogroup", { name: "Look" })).toBeTruthy()
  expect(trace.getAttribute("aria-checked")).toBe("true")
  expect([trace, bars, grid].filter((item) => item.tabIndex === 0)).toEqual([trace])

  await userEvent.tab()
  expect(document.activeElement).toBe(trace)
  await userEvent.keyboard("{ArrowRight}")
  expect(document.activeElement).toBe(bars)
  expect(onValueChange).toHaveBeenLastCalledWith("bars", expect.anything())
  expect(bars.hasAttribute("data-checked")).toBe(true)

  await userEvent.keyboard("{ArrowLeft}")
  expect(onValueChange).toHaveBeenLastCalledWith("trace", expect.anything())

  await userEvent.click(grid)
  expect(grid.getAttribute("aria-checked")).toBe("true")
  expect(trace.getAttribute("aria-checked")).toBe("false")
})
