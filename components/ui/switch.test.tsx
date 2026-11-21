import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { expect, test, vi } from "vitest"

import { Field, FieldLabel } from "./field"
import { Switch } from "./switch"

// The key guide's row: a field label beside a switch that also carries aria-label.
function PageKeys({ onChange }: { onChange: (checked: boolean) => void }) {
  const [checked, setChecked] = React.useState(true)

  return (
    <Field>
      <div>
        <FieldLabel>Page keys</FieldLabel>
        <Switch
          aria-label="Page keys"
          checked={checked}
          onCheckedChange={(next) => {
            onChange(next)
            setChecked(next)
          }}
        />
      </div>
    </Field>
  )
}

test("the switch is named, reflects checked, and Space turns it off and on", async () => {
  const onChange = vi.fn()
  render(<PageKeys onChange={onChange} />)
  const control = screen.getByRole("switch", { name: "Page keys" })

  expect(control.getAttribute("aria-checked")).toBe("true")
  expect(control.hasAttribute("aria-disabled")).toBe(false)

  await userEvent.tab()
  expect(document.activeElement).toBe(control)

  await userEvent.keyboard(" ")
  expect(onChange).toHaveBeenLastCalledWith(false)
  expect(control.getAttribute("aria-checked")).toBe("false")

  await userEvent.keyboard(" ")
  expect(onChange).toHaveBeenLastCalledWith(true)
  expect(control.getAttribute("aria-checked")).toBe("true")
})

test("pressing the field label toggles the switch", async () => {
  const onChange = vi.fn()
  render(<PageKeys onChange={onChange} />)

  await userEvent.click(screen.getByText("Page keys"))

  expect(onChange).toHaveBeenCalledOnce()
  expect(onChange).toHaveBeenLastCalledWith(false)
})

test("a controlled switch stays put when its owner ignores the change", async () => {
  const onCheckedChange = vi.fn()
  render(<Switch aria-label="Loop" checked={false} onCheckedChange={onCheckedChange} />)
  const control = screen.getByRole("switch", { name: "Loop" })

  await userEvent.click(control)

  expect(onCheckedChange).toHaveBeenLastCalledWith(true, expect.anything())
  expect(control.getAttribute("aria-checked")).toBe("false")
})
