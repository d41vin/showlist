import { expect, test } from "vitest"
import type { Doc, Id } from "../convex/_generated/dataModel"
import { mediaKey, type ItemState } from "./media"
import {
  matchesTitle,
  savedLabels,
  searchHref,
  searchLibrary,
  uniqueMedia,
} from "./search"

function item(
  id: number,
  title: string,
  extra: Partial<Doc<"items">> = {}
): Doc<"items"> {
  return {
    _id: String(id) as Id<"items">,
    _creationTime: id,
    userId: "test",
    tmdbId: id,
    title,
    mediaType: "movie",
    posterPath: null,
    year: "2020",
    inWatchlist: false,
    watched: false,
    updatedAt: id,
    ...extra,
  }
}
const titles = [
  item(1, "The Matrix", {
    watched: true,
    inWatchlist: true,
    watchedAt: 20,
    watchlistAt: 40,
    sentiment: "liked",
  }),
  item(2, "Matrix", {
    watched: true,
    watchedAt: 30,
    watchlistAt: 10,
    year: "1999",
  }),
  item(3, "Matrix Reloaded", {
    mediaType: "tv",
    watching: true,
    year: null,
    sentiment: "disliked",
  }),
]
const states = new Map<string, ItemState>([
  [
    mediaKey(titles[0]),
    {
      itemId: titles[0]._id,
      inWatchlist: true,
      watched: true,
      watching: false,
      sentiment: "liked",
      collectionIds: new Set(["collection-a" as Id<"collections">]),
    },
  ],
])

test("title matching ignores case, accents, extra spaces and token order", () => {
  expect(matchesTitle("Amélie in Paris", "  PARIS   amelie ")).toBe(true)
  expect(matchesTitle("Amélie", "Paris")).toBe(false)
})
test("best match ranks exact and prefix titles first", () => {
  expect(
    searchLibrary(titles, states, { query: "matrix", type: "all" }).map(
      (i) => i.title
    )
  ).toEqual(["Matrix", "Matrix Reloaded", "The Matrix"])
})
test("library filters combine and statuses remain independent", () => {
  expect(
    searchLibrary(titles, states, {
      query: "matrix",
      type: "movie",
      status: "watchlist",
      sentiment: "liked",
      collection: "collection-a",
    })
  ).toEqual([titles[0]])
  expect(
    searchLibrary(titles, states, { query: "", type: "all", status: "watched" })
  ).toHaveLength(2)
  expect(
    searchLibrary(titles, states, { query: "", type: "tv", sentiment: "none" })
  ).toEqual([])
})
test("recently marked uses the selected status timestamp", () => {
  expect(
    searchLibrary(titles, states, {
      query: "",
      type: "all",
      status: "watched",
      sort: "added",
    }).map((i) => i.tmdbId)
  ).toEqual([2, 1])
})
test("year sorts missing years last without mutating source", () => {
  expect(
    searchLibrary(titles, states, { query: "", type: "all", sort: "year" }).map(
      (i) => i.tmdbId
    )
  ).toEqual([1, 2, 3])
  expect(titles.map((i) => i.tmdbId)).toEqual([1, 2, 3])
})
test("unavailable collection yields no matches rather than clearing the filter", () => {
  expect(
    searchLibrary(titles, states, {
      query: "",
      type: "all",
      collection: "unknown",
    })
  ).toEqual([])
})
test("pagination deduplicates identical media, not overlapping movie/TV ids", () => {
  expect(
    uniqueMedia([titles[0], titles[0], { ...titles[0], mediaType: "tv" }])
  ).toHaveLength(2)
})
test("search routes encode user text and never inherit browse filters", () => {
  expect(searchHref("  a&b /?  ", "tv")).toBe("/search?q=a%26b+%2F%3F&type=tv")
  expect(searchHref(" ")).toBe("/search")
})
test("saved labels show all independent statuses and reactions", () => {
  expect(savedLabels(states.get(mediaKey(titles[0])))).toEqual([
    "Watchlist",
    "Watched",
    "Liked",
  ])
  expect(savedLabels(undefined)).toEqual([])
})
