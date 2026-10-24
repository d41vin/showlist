import { convexTest } from "convex-test"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = (
  import.meta as unknown as {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>
  }
).glob("./**/*.ts")
const fetchMock = vi.fn<typeof fetch>()
const setup = () =>
  convexTest(schema, modules).withIdentity({ subject: "search-test" })

beforeEach(() => {
  vi.stubEnv("TMDB_API_KEY", "test-key")
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function response(results: unknown[], total_pages = 1) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ results, total_pages }), { status: 200 })
  )
}

test("search requires authentication", async () => {
  await expect(
    convexTest(schema, modules).action(api.tmdb.search, { query: "test" })
  ).rejects.toThrow("Not signed in")
  expect(fetchMock).not.toHaveBeenCalled()
})

test("empty queries do not fetch", async () => {
  expect(await setup().action(api.tmdb.search, { query: "  " })).toEqual({
    items: [],
    hasMore: false,
  })
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each([0, -1, 1.5, 501])("rejects invalid page %s", async (page) => {
  await expect(
    setup().action(api.tmdb.search, { query: "test", page })
  ).rejects.toThrow("Invalid search page")
  expect(fetchMock).not.toHaveBeenCalled()
})

test("rejects excessively long queries", async () => {
  await expect(
    setup().action(api.tmdb.search, { query: "a".repeat(201) })
  ).rejects.toThrow("200 characters")
})

test("mixed search removes people, adult and malformed rows and deduplicates by type", async () => {
  response(
    [
      {
        id: 1,
        media_type: "movie",
        title: "Arrival",
        release_date: "2016-09-01",
      },
      { id: 1, media_type: "movie", title: "Arrival" },
      { id: 1, media_type: "tv", name: "Arrival" },
      { id: 2, media_type: "person", name: "Actor" },
      { id: 3, media_type: "movie", title: "Hidden", adult: true },
      { id: -1, media_type: "tv", name: "Invalid" },
      { id: 4, media_type: "movie" },
      null,
    ],
    4
  )
  const data = await setup().action(api.tmdb.search, { query: " Arrival " })
  expect(data.items).toEqual([
    {
      tmdbId: 1,
      mediaType: "movie",
      title: "Arrival",
      year: "2016",
      posterPath: null,
    },
    {
      tmdbId: 1,
      mediaType: "tv",
      title: "Arrival",
      year: null,
      posterPath: null,
    },
  ])
  expect(data.hasMore).toBe(true)
  const url = new URL(String(fetchMock.mock.calls[0][0]))
  expect(url.pathname).toBe("/3/search/multi")
  expect(url.searchParams.get("include_adult")).toBe("false")
  expect(url.searchParams.get("query")).toBe("Arrival")
})

test.each(["movie", "tv"] as const)(
  "%s scope uses its own endpoint on subsequent pages",
  async (mediaType) => {
    response(
      [
        {
          id: 22,
          title: "Film",
          name: "Show",
          poster_path: "/poster.jpg",
          release_date: "2020-01-01",
          first_air_date: "2021-01-01",
        },
      ],
      3
    )
    const data = await setup().action(api.tmdb.search, {
      query: "title",
      mediaType,
      page: 2,
    })
    expect(data.items[0]).toMatchObject({
      tmdbId: 22,
      mediaType,
      title: mediaType === "movie" ? "Film" : "Show",
      year: mediaType === "movie" ? "2020" : "2021",
    })
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe(`/3/search/${mediaType}`)
    expect(url.searchParams.get("page")).toBe("2")
    expect(data.hasMore).toBe(true)
  }
)

test("filtered-empty pages can still load more", async () => {
  response([{ id: 2, media_type: "person", name: "Actor" }], 2)
  expect(await setup().action(api.tmdb.search, { query: "Actor" })).toEqual({
    items: [],
    hasMore: true,
  })
})

test("pagination stops at the TMDB page limit", async () => {
  response([], 1000)
  expect(
    (await setup().action(api.tmdb.search, { query: "title", page: 500 }))
      .hasMore
  ).toBe(false)
})

test("upstream errors remain retryable failures", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 503 }))
  await expect(
    setup().action(api.tmdb.search, { query: "title" })
  ).rejects.toThrow("503")
})
