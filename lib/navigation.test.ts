import { expect, test, vi } from "vitest"
import { mediaHref } from "./media"
import { parseMediaId, parseTitlePath, replaceSearchUrl } from "./navigation"

test.each(["1", "603", "1399", String(Number.MAX_SAFE_INTEGER)])(
  "parses canonical title ID %s",
  (value) => {
    expect(parseMediaId(value)).toBe(Number(value))
  }
)

test.each([
  "",
  "0",
  "-1",
  "1.5",
  "01",
  "+1",
  "1e3",
  "0x10",
  "NaN",
  "Infinity",
  " 603",
  "603 ",
  "603\n",
  "603/movie",
  "9007199254740992",
])("rejects invalid title ID %j", (value) => {
  expect(parseMediaId(value)).toBeNull()
})

test("canonical links distinguish movies and TV with the same ID", () => {
  expect(mediaHref({ mediaType: "movie", tmdbId: 603 })).toBe("/movie/603")
  expect(mediaHref({ mediaType: "tv", tmdbId: 603 })).toBe("/tv/603")
})

test.each(["movie", "tv"])(
  "recognizes %s title and recommendation drawer routes",
  (mediaType) => {
    expect(parseTitlePath(`/${mediaType}/603`)).toEqual({
      mediaType,
      tmdbId: 603,
      recommendations: false,
    })
    expect(parseTitlePath(`/${mediaType}/603/recommendations`)).toEqual({
      mediaType,
      tmdbId: 603,
      recommendations: true,
    })
  }
)

test.each([
  "/",
  "/discover",
  "/search",
  "/movie/0",
  "/tv/01",
  "/movie/603/other",
  "/person/603",
  "/movie/603/recommendations/other",
  "/movie/603\n",
])("does not open a drawer for %j", (pathname) => {
  expect(parseTitlePath(pathname)).toBeNull()
})

test("query edits preserve the entry origin without bypassing Next URL updates", () => {
  const replaceState = vi.fn()
  vi.stubGlobal("window", {
    history: {
      state: { showlistOrigin: "origin-id", __NA: true },
      replaceState,
    },
  })
  try {
    replaceSearchUrl(new URLSearchParams({ q: "a & b" }))
    expect(replaceState).toHaveBeenCalledWith(
      { showlistOrigin: "origin-id" },
      "",
      "/search?q=a+%26+b"
    )
    replaceSearchUrl(new URLSearchParams())
    expect(replaceState).toHaveBeenLastCalledWith(
      { showlistOrigin: "origin-id" },
      "",
      "/search"
    )
  } finally {
    vi.unstubAllGlobals()
  }
})
