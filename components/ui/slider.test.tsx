import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"

import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "./slider"

test("a slider without children names its one thumb, steps with arrows, and commits on key up", async () => {
  const onValueChange = vi.fn()
  const onValueCommit = vi.fn()
  render(
    <Slider
      aria-label="Volume"
      defaultValue={50}
      step={5}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    />
  )
  const thumb = screen.getByRole("slider", { name: "Volume" })

  expect(thumb.getAttribute("aria-valuenow") ?? (thumb as HTMLInputElement).value).toBe("50")
  expect(screen.getByRole("group").hasAttribute("aria-label")).toBe(false)

  await userEvent.tab()
  expect(document.activeElement).toBe(thumb)
  await userEvent.keyboard("{ArrowRight}")

  expect(onValueChange).toHaveBeenLastCalledWith(55, expect.objectContaining({ reason: "step-key" }))
  expect(onValueCommit).toHaveBeenLastCalledWith(55, expect.anything())
  expect((thumb as HTMLInputElement).value).toBe("55")

  await userEvent.keyboard("{Home}")
  expect(onValueChange).toHaveBeenLastCalledWith(0, expect.anything())
})

test("a vertical slider grows upward and marks every part with its orientation", async () => {
  const onValueChange = vi.fn()
  render(
    <Slider
      aria-label="60 Hz"
      orientation="vertical"
      min={-12}
      max={12}
      defaultValue={0}
      onValueChange={onValueChange}
    />
  )
  const thumb = screen.getByRole("slider", { name: "60 Hz" })

  expect(thumb.getAttribute("aria-orientation")).toBe("vertical")
  expect(document.querySelector('[data-slot="slider-track"]')?.getAttribute("data-orientation")).toBe("vertical")

  thumb.focus()
  await userEvent.keyboard("{ArrowUp}")
  expect(onValueChange).toHaveBeenLastCalledWith(1, expect.anything())
})

test("composed parts take extra children in the track and keep the thumb's name", () => {
  const onValueChange = vi.fn()
  render(
    <Slider aria-label="Seek" defaultValue={10} onValueChange={onValueChange}>
      <SliderControl>
        <SliderTrack>
          <div data-testid="buffered" />
          <SliderIndicator />
          <SliderThumb aria-label="Seek" />
        </SliderTrack>
      </SliderControl>
    </Slider>
  )
  const thumb = screen.getByRole("slider", { name: "Seek" })
  const track = document.querySelector('[data-slot="slider-track"]')

  expect(track?.contains(screen.getByTestId("buffered"))).toBe(true)
  expect(track?.contains(thumb)).toBe(true)

  fireEvent.change(thumb, { target: { value: "40" } })
  expect(onValueChange).toHaveBeenLastCalledWith(40, expect.anything())
})

test("a disabled slider does not move", async () => {
  const onValueChange = vi.fn()
  render(<Slider aria-label="Balance" disabled defaultValue={20} onValueChange={onValueChange} />)

  await userEvent.tab()
  await userEvent.keyboard("{ArrowRight}")

  expect(onValueChange).not.toHaveBeenCalled()
  expect(document.querySelector('[data-slot="slider-thumb"]')?.hasAttribute("data-disabled")).toBe(true)
})
