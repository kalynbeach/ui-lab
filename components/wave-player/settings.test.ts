import { describe, expect, test } from "vitest"

import {
  DEFAULT_SETTINGS,
  localSettings,
  parseSettings,
  serializeSettings,
  type Settings,
} from "./settings"

describe("parseSettings", () => {
  test("reads back what serializeSettings wrote", () => {
    const settings: Settings = { level: 0.42, muted: true, shuffle: true, repeat: "all" }

    expect(parseSettings(serializeSettings(settings))).toEqual(settings)
  })

  test.each([null, "", "{", "null", "3", "[]", '{"level":0.5}', '{"version":2,"level":0.5}'])(
    "%s reads as nothing saved",
    (text) => {
      expect(parseSettings(text)).toBeNull()
    }
  )

  test("a field that does not check out takes its default, and the level clamps", () => {
    expect(
      parseSettings(JSON.stringify({ version: 1, level: 7, muted: "yes", shuffle: 1, repeat: "twice" }))
    ).toEqual({ ...DEFAULT_SETTINGS, level: 1 })
    expect(parseSettings(JSON.stringify({ version: 1, level: -2 }))?.level).toBe(0)
  })
})

describe("localSettings", () => {
  test("reads and writes its key", () => {
    const store = localSettings("wave-player-test", () => localStorage)

    store.write("saved")

    expect(store.read()).toBe("saved")
    expect(localStorage.getItem("wave-player-test")).toBe("saved")
    localStorage.removeItem("wave-player-test")
  })

  test("storage that throws reads as nothing saved and writes nothing, without throwing", () => {
    const store = localSettings("k", () => {
      throw new DOMException("denied", "SecurityError")
    })

    expect(store.read()).toBeNull()
    expect(() => store.write("x")).not.toThrow()
  })
})
