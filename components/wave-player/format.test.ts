import { expect, test } from "vitest"

import {
  formatClock,
  formatCount,
  formatOrdinal,
  formatRemaining,
  seekValueText,
  UNKNOWN_TIME,
} from "./format"

test.each([
  [84, "01:24"],
  [84.9, "01:24"],
  [0, "00:00"],
  [-3, "00:00"],
  [3723, "1:02:03"],
  [null, UNKNOWN_TIME],
])("formatClock(%s) is %s", (seconds, text) => {
  expect(formatClock(seconds)).toBe(text)
})

test("the remaining time adds up with the whole seconds shown", () => {
  expect(formatRemaining(84, 272)).toBe("−03:08")
  expect(formatRemaining(84.7, 272.2)).toBe("−03:08")
  expect(formatRemaining(300, 272)).toBe("−00:00")
  expect(formatRemaining(84, null)).toBe(UNKNOWN_TIME)
})

test("the seek bar speaks minutes without padding", () => {
  expect(seekValueText(84, 272)).toBe("1:24 of 4:32")
  expect(seekValueText(84, null)).toBe("1:24")
  expect(seekValueText(5, 3723)).toBe("0:05 of 1:02:03")
})

test("counts and ordinals pad to two digits, or the count's width", () => {
  expect(formatCount(5)).toBe("05")
  expect(formatCount(120)).toBe("120")
  expect(formatOrdinal(0, 5)).toBe("01 / 05")
  expect(formatOrdinal(8, 120)).toBe("009 / 120")
})
