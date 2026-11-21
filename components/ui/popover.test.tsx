import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { expect, test, vi } from "vitest"

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "./popover"

// The shape of kevelle/waveform's key guide: a stage button opens it with ?,
// and a hidden trigger only places it.
function Guide({
  onOpenChange,
}: {
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = React.useState(false)
  const stage = React.useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={stage}
        type="button"
        aria-label="Stage"
        onKeyDown={(event) => {
          if (event.key === "?") setOpen(true)
        }}
      />
      <Popover
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next)
          setOpen(next)
        }}
      >
        <PopoverTrigger
          nativeButton={false}
          tabIndex={-1}
          aria-hidden="true"
          render={<span data-testid="edge" />}
          className="edge"
        >
          Press ? for keys
        </PopoverTrigger>
        <PopoverContent side="top" initialFocus={false} finalFocus={stage}>
          <PopoverTitle>Keys</PopoverTitle>
          <PopoverDescription>Keys play while the stage has focus.</PopoverDescription>
          <button type="button">Inside</button>
        </PopoverContent>
      </Popover>
    </>
  )
}

test("the guide opens from its open prop, named and described, and leaves focus where it was", async () => {
  render(<Guide />)
  const stage = screen.getByRole("button", { name: "Stage" })

  expect(screen.queryByRole("dialog")).toBeNull()

  stage.focus()
  await userEvent.keyboard("?")

  const dialog = screen.getByRole("dialog", { name: "Keys" })
  expect(dialog.getAttribute("aria-describedby")).toBe(
    screen.getByText("Keys play while the stage has focus.").id
  )
  expect(dialog.dataset.side).toBe("top")
  expect(document.activeElement).toBe(stage)
})

test("Escape closes the guide and reports it", async () => {
  const onOpenChange = vi.fn()
  render(<Guide onOpenChange={onOpenChange} />)
  screen.getByRole("button", { name: "Stage" }).focus()
  await userEvent.keyboard("?")

  await userEvent.keyboard("{Escape}")

  expect(onOpenChange).toHaveBeenLastCalledWith(false)
  expect(screen.queryByRole("dialog")).toBeNull()
})

test("closing with focus inside returns focus to finalFocus", async () => {
  render(<Guide />)
  const stage = screen.getByRole("button", { name: "Stage" })
  stage.focus()
  await userEvent.keyboard("?")

  screen.getByRole("button", { name: "Inside" }).focus()
  await userEvent.keyboard("{Escape}")

  expect(screen.queryByRole("dialog")).toBeNull()
  expect(document.activeElement).toBe(stage)
})

test("finalFocus can send focus somewhere other than where it was", async () => {
  function Elsewhere() {
    const [open, setOpen] = React.useState(false)
    const target = React.useRef<HTMLButtonElement>(null)

    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        <button ref={target} type="button">
          Target
        </button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverContent finalFocus={target}>
            <PopoverTitle>Keys</PopoverTitle>
            <button type="button">Inside</button>
          </PopoverContent>
        </Popover>
      </>
    )
  }
  render(<Elsewhere />)

  await userEvent.click(screen.getByRole("button", { name: "Open" }))
  screen.getByRole("button", { name: "Inside" }).focus()
  await userEvent.keyboard("{Escape}")

  expect(screen.queryByRole("dialog")).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Target" }))
})

test("a hidden trigger renders its own element, out of reach, and places the guide", async () => {
  render(<Guide />)
  const edge = screen.getByTestId("edge")

  expect(edge.tagName).toBe("SPAN")
  expect(edge.className).toBe("edge")
  expect(edge.getAttribute("tabindex")).toBe("-1")
  expect(edge.getAttribute("aria-hidden")).toBe("true")
  expect(edge.hasAttribute("aria-haspopup")).toBe(false)
  expect(edge.hasAttribute("aria-expanded")).toBe(false)
  expect(edge.hasAttribute("type")).toBe(false)
  expect(edge.textContent).toBe("Press ? for keys")

  edge.getBoundingClientRect = () => DOMRect.fromRect({ x: 120, y: 300, width: 80, height: 20 })
  screen.getByRole("button", { name: "Stage" }).focus()
  await userEvent.keyboard("?")

  const dialog = screen.getByRole("dialog", { name: "Keys" })
  await vi.waitFor(() => expect(dialog.style.top).toBe("290px"))
})

test("a visible trigger is a button that opens and closes the popover", async () => {
  render(
    <Popover>
      <PopoverTrigger>Details</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Track details</PopoverTitle>
      </PopoverContent>
    </Popover>
  )
  const trigger = screen.getByRole("button", { name: "Details" })

  await userEvent.click(trigger)
  expect(screen.getByRole("dialog", { name: "Track details" })).toBeTruthy()
  expect(trigger.getAttribute("aria-expanded")).toBe("true")

  await userEvent.click(trigger)
  expect(screen.queryByRole("dialog")).toBeNull()
})
