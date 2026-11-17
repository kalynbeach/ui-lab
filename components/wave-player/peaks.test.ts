import { describe, expect, test } from "vitest"

import { toSeconds } from "@/lib/audio/index"

import {
  barCount,
  layoutBars,
  playedBars,
  playedDensity,
  rampBands,
  reducePeaks,
  resamplePeaks,
  toPeaks,
} from "./peaks"

describe("toPeaks", () => {
  test("clamps into 0 to 1 and drops values that aren't finite", () => {
    expect(toPeaks([-0.5, 0.25, 3, Number.NaN])).toEqual([0, 0.25, 1])
  })

  test("is null when nothing is left", () => {
    expect(toPeaks([])).toBeNull()
    expect(toPeaks([Number.NaN, Number.NEGATIVE_INFINITY])).toBeNull()
  })
})

describe("reducePeaks", () => {
  test("takes each bucket's loudest sample on any channel and scales the loudest bucket to 1", () => {
    const left = new Float32Array([0.1, -0.2, 0.05, 0.1])
    const right = new Float32Array([0, 0.1, -0.4, 0])

    expect(reducePeaks([left, right], 2)).toEqual([0.5, 1])
  })

  test("keeps one bucket per sample in a short file", () => {
    expect(reducePeaks([new Float32Array([0.5, 0.25])], 256)).toEqual([1, 0.5])
  })

  test("draws silence flat and nothing as null", () => {
    expect(reducePeaks([new Float32Array(4)], 2)).toEqual([0, 0])
    expect(reducePeaks([], 256)).toBeNull()
  })
})

describe("bar layout", () => {
  test.each([
    [308, 77],
    [176, 44],
    [168, 42],
    [1, 0],
    [0, 0],
  ])("%d px fits %d bars", (width, count) => {
    expect(barCount(width)).toBe(count)
  })

  test("each bar takes the loudest value it covers, and short peaks repeat", () => {
    const peaks = toPeaks([0.1, 0.9, 0.2, 0.3])!

    expect(resamplePeaks(peaks, 2)).toEqual([0.9, 0.3])
    expect(resamplePeaks(toPeaks([0.4, 0.8])!, 4)).toEqual([0.4, 0.4, 0.8, 0.8])
  })

  test("bars sit on a 4 px pitch, 5 to 35 px tall, centered in 36 px on whole pixels", () => {
    expect(layoutBars([0, 1, 0.5])).toEqual([
      { x: 0, y: 16, height: 5 },
      { x: 4, y: 1, height: 35 },
      { x: 8, y: 8, height: 20 },
    ])
  })

  test("a partial bar counts as played", () => {
    expect(playedBars(84, toSeconds(272), 44)).toBe(14)
    expect(playedBars(0.01, toSeconds(272), 44)).toBe(1)
    expect(playedBars(0, toSeconds(272), 44)).toBe(0)
    expect(playedBars(400, toSeconds(272), 44)).toBe(44)
  })

  test("nothing reads played while the duration is unknown", () => {
    expect(playedBars(84, null, 44)).toBe(0)
    expect(playedBars(84, toSeconds(0), 44)).toBe(0)
  })
})

describe("played density", () => {
  test("rises from sparse to solid across the played run", () => {
    const densities = Array.from({ length: 10 }, (_, index) => playedDensity(index, 10))

    expect(densities[0]).toBe(25)
    expect(densities.at(-1)).toBe(100)
    expect(densities).toEqual([...densities].sort((a, b) => a - b))
    expect(new Set(densities)).toEqual(new Set([25, 50, 75, 100]))
  })

  test("a single played bar is solid", () => {
    expect(playedDensity(0, 1)).toBe(100)
  })

  test("the groove's bands cover the played width in rising densities with a solid lead", () => {
    for (const width of [1, 2, 7, 40, 177]) {
      const bands = rampBands(width)
      const covered = bands.reduce((x, band) => {
        expect(band.x).toBe(x)

        return x + band.width
      }, 0)

      expect(covered).toBe(width)
      expect(bands.at(-1)?.density).toBe(100)
      expect(bands.map((band) => band.density)).toEqual(
        [...bands.map((band) => band.density)].sort((a, b) => a - b)
      )
    }

    expect(rampBands(0)).toEqual([])
  })
})
