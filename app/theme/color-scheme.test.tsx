import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

const system = vi.hoisted(() => {
  let dark = false
  const listeners = new Set<(event: { matches: boolean }) => void>()
  const query = {
    get matches() {
      return dark
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.delete(listener),
    addListener: (listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeListener: (listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
  }
  window.matchMedia = (() => query) as unknown as typeof window.matchMedia
  return {
    prefersDark(next: boolean) {
      dark = next
      for (const listener of listeners) listener({ matches: dark })
    },
  }
})

import {
  ColorSchemeControl,
  ColorSchemePreferences,
  colorScheme,
} from "./color-scheme"

afterEach(() => {
  act(() => {
    colorScheme.set("system")
    system.prefersDark(false)
  })
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
  expect(html.classList.contains("light")).toBe(false)
  expect(localStorage.getItem("color-scheme")).toContain("dark")

  await userEvent.click(screen.getByRole("radio", { name: "Light" }))
  expect(html.getAttribute("data-color-scheme")).toBe("light")
  expect(html.classList.contains("dark")).toBe(false)
  expect(html.classList.contains("light")).toBe(true)
})

test("System mirrors the scheme the system resolved to, and follows a change", async () => {
  act(() => system.prefersDark(true))
  renderControl()
  const html = document.documentElement

  await waitFor(() => expect(html.classList.contains("dark")).toBe(true))
  expect(html.classList.contains("light")).toBe(false)
  expect(screen.getByRole("radio", { name: "System" }).getAttribute("aria-checked")).toBe("true")

  act(() => system.prefersDark(false))
  await waitFor(() => expect(html.classList.contains("light")).toBe(true))
  expect(html.classList.contains("dark")).toBe(false)
})

test("a saved Light choice holds while the system prefers dark", async () => {
  act(() => system.prefersDark(true))
  renderControl()
  const html = document.documentElement

  await userEvent.click(screen.getByRole("radio", { name: "Light" }))
  expect(html.classList.contains("light")).toBe(true)
  expect(html.classList.contains("dark")).toBe(false)
})

test("the theme control is one radio group with System checked by default", () => {
  renderControl()
  expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeTruthy()
  expect(
    screen.getByRole("radio", { name: "System" }).getAttribute("aria-checked")
  ).toBe("true")
})
