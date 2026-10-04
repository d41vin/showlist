import { describe, expect, test } from "vitest"

import { isRecent, isUpcoming, parseDayMs } from "./schedule_windows"

const TODAY = parseDayMs("2026-10-04")!
const DAY = 24 * 60 * 60 * 1000

function offsetDays(days: number) {
  return TODAY + days * DAY
}

describe("parseDayMs", () => {
  test("parses strict YYYY-MM-DD", () => {
    expect(parseDayMs("2026-10-04")).toBe(TODAY)
  })
  test("rejects null, garbage and non-padded forms", () => {
    expect(parseDayMs(null)).toBeNull()
    expect(parseDayMs("")).toBeNull()
    expect(parseDayMs("2026-1-4")).toBeNull()
    expect(parseDayMs("2026-13-40")).toBeNull()
    expect(parseDayMs("not a date")).toBeNull()
  })
})

describe("isUpcoming", () => {
  test("today counts", () => {
    expect(isUpcoming(TODAY, TODAY)).toBe(true)
  })
  test("day 30 counts, day 31 does not", () => {
    expect(isUpcoming(offsetDays(30), TODAY)).toBe(true)
    expect(isUpcoming(offsetDays(31), TODAY)).toBe(false)
  })
  test("the past never counts", () => {
    expect(isUpcoming(offsetDays(-1), TODAY)).toBe(false)
  })
})

describe("isRecent", () => {
  test("yesterday counts, today does not", () => {
    expect(isRecent(offsetDays(-1), TODAY)).toBe(true)
    expect(isRecent(TODAY, TODAY)).toBe(false)
  })
  test("8 days back counts, 9 does not", () => {
    expect(isRecent(offsetDays(-8), TODAY)).toBe(true)
    expect(isRecent(offsetDays(-9), TODAY)).toBe(false)
  })
  test("the future never counts", () => {
    expect(isRecent(offsetDays(1), TODAY)).toBe(false)
  })
})
