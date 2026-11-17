import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SpeakerHighIcon } from "@phosphor-icons/react"
import { expect, test } from "vitest"

import { Button } from "./button"
import {
  KbdShortcut,
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "./tooltip"

function Mute() {
  return (
    <Tooltip shortcut="m">
      <TooltipTrigger render={<Button size="icon" variant="secondary" />}>
        <SpeakerHighIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>
        Mute
        <TooltipShortcut />
      </TooltipContent>
    </Tooltip>
  )
}

// The tooltip guesses whether it names or describes its trigger after mount.
test("the tooltip names an icon-only trigger, and its shortcut reaches the trigger and a Kbd", async () => {
  render(<Mute />)
  const trigger = await screen.findByRole("button", { name: "Mute" })
  const keys = document.querySelector('[data-slot="tooltip-shortcut"]')

  expect(trigger.getAttribute("aria-keyshortcuts")).toBe("M")
  expect(keys?.tagName).toBe("KBD")
  expect(keys?.getAttribute("aria-hidden")).toBe("true")
  expect(keys?.textContent).toContain("M")
})

test("focus opens the tooltip at once and Escape closes it, leaving focus on the trigger", async () => {
  render(<Mute />)
  const trigger = await screen.findByRole("button", { name: "Mute" })
  const content = document.querySelector<HTMLElement>('[data-slot="tooltip-content"]')!

  await userEvent.tab()
  expect(content.hasAttribute("data-open")).toBe(true)

  await userEvent.keyboard("{Escape}")
  expect(content.hasAttribute("data-open")).toBe(false)
  expect(document.activeElement).toBe(trigger)
})

test("KbdShortcut formats keys for the platform and stays out of the accessibility tree", () => {
  render(<KbdShortcut keys="mod+k" />)
  const key = document.querySelector("kbd")!

  expect(key.getAttribute("aria-hidden")).toBe("true")
  expect(key.textContent).toMatch(/Ctrl\+K|⌘K/)
})
