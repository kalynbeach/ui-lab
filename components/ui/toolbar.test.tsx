import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PlayIcon, SkipBackIcon, SkipForwardIcon } from "@phosphor-icons/react"
import { expect, test, vi } from "vitest"

import { Toggle } from "./toggle"
import { Toolbar, ToolbarButton, ToolbarSeparator } from "./toolbar"
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from "./tooltip"

function Transport({ onPrevious }: { onPrevious?: () => void }) {
  return (
    <Toolbar aria-label="Transport">
      <ToolbarButton size="icon" aria-label="Previous" onClick={onPrevious}>
        <SkipBackIcon aria-hidden="true" />
      </ToolbarButton>
      <Tooltip shortcut="space">
        <TooltipTrigger render={<Toggle size="icon" aria-label="Play" />}>
          <PlayIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>
          Play
          <TooltipShortcut />
        </TooltipContent>
      </Tooltip>
      <ToolbarSeparator />
      <ToolbarButton size="icon" aria-label="Next">
        <SkipForwardIcon aria-hidden="true" />
      </ToolbarButton>
    </Toolbar>
  )
}

test("the toolbar is one tab stop with arrow roving across buttons and toggles", async () => {
  render(<Transport />)
  const previous = screen.getByRole("button", { name: "Previous" })
  const play = screen.getByRole("button", { name: "Play" })
  const next = screen.getByRole("button", { name: "Next" })
  const items = [previous, play, next]

  expect(screen.getByRole("toolbar", { name: "Transport" })).toBeTruthy()
  expect(items.filter((item) => item.tabIndex === 0)).toEqual([previous])

  await userEvent.tab()
  expect(document.activeElement).toBe(previous)
  await userEvent.keyboard("{ArrowRight}")
  expect(document.activeElement).toBe(play)
  expect(play.getAttribute("aria-pressed")).toBe("false")
  await userEvent.keyboard("{ArrowRight}")
  expect(document.activeElement).toBe(next)
  await userEvent.keyboard("{ArrowLeft}")
  expect(document.activeElement).toBe(play)
  await userEvent.keyboard("{End}")
  expect(document.activeElement).toBe(next)
  await userEvent.keyboard("{Home}")
  expect(document.activeElement).toBe(previous)

  await userEvent.tab()
  expect(items).not.toContain(document.activeElement)
})

test("a toggle wrapped in a tooltip keeps its name, its pressed state, and the shortcut", async () => {
  render(<Transport />)
  const play = screen.getByRole("button", { name: "Play" })

  expect(play.getAttribute("aria-keyshortcuts")).toBe("Space")
  await userEvent.click(play)
  expect(play.getAttribute("aria-pressed")).toBe("true")
})

test("toolbar buttons press, and the separator divides without a tab stop", async () => {
  const onPrevious = vi.fn()
  render(<Transport onPrevious={onPrevious} />)

  await userEvent.tab()
  await userEvent.keyboard("{Enter}")
  expect(onPrevious).toHaveBeenCalledOnce()

  const separator = screen.getByRole("separator")
  expect(separator.getAttribute("aria-orientation")).toBe("vertical")
  expect(separator.hasAttribute("tabindex")).toBe(false)
})
