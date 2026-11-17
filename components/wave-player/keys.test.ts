import { describe, expect, test } from "vitest"

import { seekTarget, spaceToggles, type KeyInput } from "./keys"

function key(overrides: Partial<KeyInput> = {}): KeyInput {
  return {
    key: " ",
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    target: document.body,
    ...overrides,
  }
}

describe("spaceToggles", () => {
  test("a plain Space on the player toggles", () => {
    const root = document.createElement("div")

    expect(spaceToggles(key({ target: root }))).toBe(true)
    expect(spaceToggles(key({ target: null }))).toBe(true)
  })

  test.each<[string, Partial<KeyInput>]>([
    ["another key", { key: "Enter" }],
    ["a repeat", { repeat: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Alt", { altKey: true }],
    ["a handled key", { defaultPrevented: true }],
  ])("not on %s", (_, overrides) => {
    expect(spaceToggles(key(overrides))).toBe(false)
  })

  test.each([
    "<button></button>",
    '<input type="range">',
    "<textarea></textarea>",
    '<div role="slider"></div>',
    '<div role="switch"></div>',
    '<div contenteditable="true"></div>',
    '<a href="/"><span></span></a>',
  ])("not from inside %s", (html) => {
    const host = document.createElement("div")
    host.innerHTML = html
    const target = host.querySelector("span") ?? host.firstElementChild

    expect(spaceToggles(key({ target }))).toBe(false)
  })
})

describe("seekTarget", () => {
  test.each([
    ["ArrowRight", 105],
    ["ArrowUp", 105],
    ["ArrowLeft", 95],
    ["ArrowDown", 95],
    ["PageUp", 130],
    ["PageDown", 70],
    ["Home", 0],
    ["End", 200],
  ])("%s from 100 of 200 goes to %d", (name, to) => {
    expect(seekTarget(name, 100, 200)).toBe(to)
  })

  test("clamps into the track", () => {
    expect(seekTarget("ArrowLeft", 2, 200)).toBe(0)
    expect(seekTarget("PageUp", 190, 200)).toBe(200)
  })

  test("is null for other keys and while the duration is unknown", () => {
    expect(seekTarget("a", 100, 200)).toBeNull()
    expect(seekTarget("ArrowRight", 100, null)).toBeNull()
  })
})
