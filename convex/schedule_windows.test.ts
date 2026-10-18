import { describe, expect, test } from "vitest"

import { inRange, parseDayMs } from "./schedule_windows"

const FROM = parseDayMs("2026-10-19")!
const TO = parseDayMs("2026-10-25")!
const DAY = 24 * 60 * 60 * 1000

function offsetDays(base: number, days: number) {
  return base + days * DAY
}

describe("parseDayMs", () => {
  test("parses strict YYYY-MM-DD", () => {
    expect(parseDayMs("2026-10-19")).toBe(FROM)
  })
  test("rejects null, garbage and non-padded forms", () => {
    expect(parseDayMs(null)).toBeNull()
    expect(parseDayMs("")).toBeNull()
    expect(parseDayMs("2026-1-4")).toBeNull()
    expect(parseDayMs("2026-13-40")).toBeNull()
    expect(parseDayMs("not a date")).toBeNull()
  })
})

describe("inRange", () => {
  test("the first day of the range counts", () => {
    expect(inRange(FROM, FROM, TO)).toBe(true)
  })
  test("the last day of the range counts", () => {
    expect(inRange(TO, FROM, TO)).toBe(true)
  })
  test("the day before the range does not", () => {
    expect(inRange(offsetDays(FROM, -1), FROM, TO)).toBe(false)
  })
  test("the day after the range does not", () => {
    expect(inRange(offsetDays(TO, 1), FROM, TO)).toBe(false)
  })
  test("every day inside a multi-day span counts", () => {
    for (let day = 0; day <= 6; day++) {
      expect(inRange(offsetDays(FROM, day), FROM, TO)).toBe(true)
    }
  })
})
