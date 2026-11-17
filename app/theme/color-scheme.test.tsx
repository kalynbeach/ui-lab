import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import {
  ColorSchemeControl,
  ColorSchemePreferences,
  colorScheme,
} from "./color-scheme"

afterEach(() => {
  colorScheme.set("system")
  localStorage.clear()
})

function renderControl() {
  render(
    <ColorSchemePreferences>
      <ColorSchemeControl />
    </ColorSchemePreferences>
  )
}

test("choosing a theme sets the attribute, the class the waveform engine reads, and storage", async () => {
  renderControl()
  const html = document.documentElement

  await userEvent.click(screen.getByRole("radio", { name: "Dark" }))
  expect(html.getAttribute("data-color-scheme")).toBe("dark")
  expect(html.classList.contains("dark")).toBe(true)
  expect(localStorage.getItem("color-scheme")).toContain("dark")

  await userEvent.click(screen.getByRole("radio", { name: "Light" }))
  expect(html.getAttribute("data-color-scheme")).toBe("light")
  expect(html.classList.contains("dark")).toBe(false)
  expect(html.classList.contains("light")).toBe(true)

  await userEvent.click(screen.getByRole("radio", { name: "System" }))
  expect(html.getAttribute("data-color-scheme")).toBe("system")
  expect(html.classList.contains("dark")).toBe(false)
  expect(html.classList.contains("light")).toBe(false)
})

test("the theme control is one radio group with System checked by default", () => {
  renderControl()
  expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeTruthy()
  expect(
    screen.getByRole("radio", { name: "System" }).getAttribute("aria-checked")
  ).toBe("true")
})
