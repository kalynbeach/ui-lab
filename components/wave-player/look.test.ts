import { describe, expect, test } from "vitest"

import { parseWaveformConfig, RATIOS, type RatioId } from "@/components/waveform/settings"

import { checkLook, currentLook, DEFAULT_LOOK, type WavePlayerLook } from "./look"

describe("checkLook", () => {
  test("sets the look to draw the audio and keeps the rest", () => {
    const look: WavePlayerLook = { source: "tones", motion: { drift: 0.2 } }

    expect(checkLook(look)).toEqual({ source: "audio", motion: { drift: 0.2 } })
  })

  test("returns one checked object per look object", () => {
    const look: WavePlayerLook = { source: "tones" }

    expect(checkLook(look)).toBe(checkLook(look))
  })

  test("is null for a look that isn't an object", () => {
    expect(checkLook("dark" as unknown as WavePlayerLook)).toBeNull()
    expect(checkLook([1, 2] as unknown as WavePlayerLook)).toBeNull()
  })

  test.each(Object.keys(RATIOS) as RatioId[])(
    "folds a screen figure of %s into the tones",
    (ratio) => {
      const look: WavePlayerLook = {
        tones: { ratio: "free", yHz: 300 },
        forms: { screen: { figure: ratio, size: 0.8 }, glow: { figure: "2:1" } },
      }

      expect(checkLook(look)).toEqual({
        source: "audio",
        tones: { ratio, yHz: 300 },
        forms: { screen: { figure: "shared", size: 0.8 }, glow: { figure: "2:1" } },
      })
    }
  )

  test("leaves a screen figure that isn't a ratio alone", () => {
    const look: WavePlayerLook = { forms: { screen: { figure: "shared" } } }

    expect(checkLook(look)).toEqual({ source: "audio", forms: { screen: { figure: "shared" } } })
  })
})

test("the waveform's parser keeps every field of the default look", () => {
  const config = parseWaveformConfig(DEFAULT_LOOK)

  expect(config.source).toBe("audio")
  expect(config.tones.ratio).toBe("5:4")
  expect(config.tones.x.phase).toBeCloseTo(0.9)
  expect(config.tones.x.detuneCents).toBe(0)
  expect(config.tones.y.phase).toBeCloseTo(Math.PI)
})

describe("currentLook", () => {
  test("is the default look for a track without one", () => {
    expect(currentLook(null, null)).toBe(DEFAULT_LOOK)
  })

  test("keeps the previous object while the content is the same", () => {
    const previous: WavePlayerLook = { source: "audio", motion: { drift: 1 } }

    expect(currentLook({ source: "audio", motion: { drift: 1 } }, previous)).toBe(previous)
    expect(currentLook(null, DEFAULT_LOOK)).toBe(DEFAULT_LOOK)
  })

  test("changes when the content does", () => {
    const next: WavePlayerLook = { source: "audio", motion: { drift: 2 } }

    expect(currentLook(next, { source: "audio", motion: { drift: 1 } })).toBe(next)
    expect(currentLook(null, next)).toBe(DEFAULT_LOOK)
  })
})
