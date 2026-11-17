import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/react/slider"
import { expect, test, vi } from "vitest"

test("a ui-sdk slider reports keyboard steps and commits in jsdom", async () => {
  const onValueChange = vi.fn()
  const onValueCommit = vi.fn()
  render(
    <Slider
      defaultValue={10}
      min={0}
      max={100}
      step={1}
      largeStep={20}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    >
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb aria-label="Level" />
        </SliderTrack>
      </SliderControl>
    </Slider>
  )

  const thumb = screen.getByRole("slider", { name: "Level" })
  await userEvent.tab()
  expect(document.activeElement).toBe(thumb)

  await userEvent.keyboard("{ArrowRight}")
  expect(onValueChange.mock.lastCall?.[0]).toBe(11)
  expect(onValueChange.mock.lastCall?.[1]).toMatchObject({ reason: "step-key" })

  await userEvent.keyboard("{PageUp}")
  expect(onValueCommit.mock.lastCall?.[0]).toBe(31)
})
