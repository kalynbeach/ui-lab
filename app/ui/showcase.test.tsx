import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createAgent } from "@ui-sdk/react/agent"
import { expect, test } from "vitest"

import { Showcase } from "./showcase"

const agent = createAgent()

async function renderShowcase() {
  render(<Showcase />)
  // Tooltips decide whether they name their trigger after mount.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

test("an agent can find and use every control on the page", async () => {
  await renderShowcase()

  const components = agent
    .snapshot()
    .filter((entry) => !entry.offPage && entry.component !== "more")
  for (const entry of components) {
    expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  }
  const labels = components.map((entry) => entry.label)
  for (const label of [
    "Render",
    "Copy",
    "Load",
    "Repeat",
    "Quantize",
    "Transport",
    "Play",
    "Previous",
    "Next",
    "Shuffle",
    "Mute",
    "Volume",
    "Position",
    "Low",
    "Look",
    "Decoding",
    "Advance progress",
    "Details",
    "Click track",
  ]) {
    expect(labels, `${label} is missing from the snapshot`).toContain(label)
  }

  const result = await agent.act({
    steps: [
      { ref: "Play", action: "setPressed", args: [true] },
      { ref: "Shuffle", action: "setPressed", args: [true] },
      { ref: "Volume", action: "setValue", args: [30] },
      { ref: "Look", action: "setValue", args: ["bars"] },
      { ref: "Quantize", action: "setValue", args: [["phrase"]] },
      { ref: "Click track", action: "setChecked", args: [true] },
      { ref: "Advance progress", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)

  expect(screen.getByRole("button", { name: "Play" }).getAttribute("aria-pressed")).toBe("true")
  expect(screen.getByRole("button", { name: "Shuffle" }).getAttribute("aria-pressed")).toBe("true")
  expect(screen.getByRole<HTMLInputElement>("slider", { name: "Volume" }).value).toBe("30")
  expect(screen.getByRole("radio", { name: "Bars" }).getAttribute("aria-checked")).toBe("true")
  expect(screen.getByRole("button", { name: "Phrase" }).getAttribute("aria-pressed")).toBe("true")
  expect(screen.getByRole("switch", { name: "Click track" }).getAttribute("aria-checked")).toBe("true")
  expect(screen.getByRole("progressbar", { name: "Decoding" }).getAttribute("aria-valuenow")).toBe("40")
})

test("the transport names its icon keys from their tooltips, and its shortcuts flip shuffle and mute", async () => {
  await renderShowcase()
  const shuffle = screen.getByRole("button", { name: "Shuffle" })
  const mute = screen.getByRole("button", { name: "Mute" })

  expect(screen.getByRole("toolbar", { name: "Transport" })).toBeTruthy()
  expect(shuffle.getAttribute("aria-keyshortcuts")).toBe("S")
  expect(mute.getAttribute("aria-keyshortcuts")).toBe("M")

  await userEvent.keyboard("s")
  await userEvent.keyboard("m")
  expect(shuffle.getAttribute("aria-pressed")).toBe("true")
  expect(mute.getAttribute("aria-pressed")).toBe("true")
})

test("held states sit out of the tab order and the accessibility tree", async () => {
  await renderShowcase()
  const held = document.querySelectorAll("[data-preview]")

  expect(held.length).toBeGreaterThan(0)
  for (const element of held) {
    expect(element.closest("[inert][aria-hidden='true']"), "a held cell is reachable").not.toBeNull()
  }
  expect(screen.queryAllByRole("button", { name: "Snap" })).toHaveLength(1)
})
