import { convexTest } from "convex-test"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { api, internal } from "./_generated/api"
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

const titleArgs = { mediaType: "movie", tmdbId: 22 } as const
const titleKey = "title:movie:22:v1"
const detailsKey = "details:movie:22:v2"
const detailsTtl = 12 * 60 * 60 * 1000
const movieData = {
  id: 22,
  adult: false,
  title: "Arrival",
  poster_path: "/arrival.jpg",
  release_date: "2016-09-01",
  overview: "A linguist meets visitors from another world.",
  tagline: "Why are they here?",
  genres: [{ id: 878, name: "Science Fiction" }],
  runtime: 116,
  vote_average: 7.6,
  backdrop_path: "/backdrop.jpg",
  status: "Released",
}
const moviePayload = {
  item: {
    tmdbId: 22,
    mediaType: "movie",
    title: "Arrival",
    posterPath: "/arrival.jpg",
    year: "2016",
  },
  details: {
    overview: movieData.overview,
    tagline: movieData.tagline,
    genres: ["Science Fiction"],
    runtime: 116,
    numberOfSeasons: null,
    numberOfEpisodes: null,
    voteAverage: 7.6,
    releaseDate: "2016-09-01",
    backdropPath: "/backdrop.jpg",
    logoPath: "/english.png",
    status: "Released",
    seasons: [],
    nextEpisode: null,
    lastEpisode: null,
  },
}
const titleImages = {
  logos: [
    { iso_639_1: null, file_path: "/neutral.png" },
    { iso_639_1: "en", file_path: "/english.png" },
  ],
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 })
}

function titleResponse(
  data: unknown = movieData,
  images: unknown = titleImages
) {
  fetchMock.mockResolvedValueOnce(jsonResponse(data))
  fetchMock.mockResolvedValueOnce(jsonResponse(images))
}

async function titleCache(t: ReturnType<typeof setup>) {
  return await t.query(internal.tmdb_cache.getBatch, {
    keys: [titleKey, detailsKey],
  })
}

test("title requires authentication even with a warm cache", async () => {
  const t = convexTest(schema, modules)
  await t.mutation(internal.tmdb_cache.putBatch, {
    entries: [{ key: titleKey, payload: moviePayload, fetchedAt: Date.now() }],
  })
  await expect(t.action(api.tmdb.title, titleArgs)).rejects.toThrow(
    "Not signed in"
  )
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity])(
  "title rejects invalid ID %s before fetching or caching",
  async (tmdbId) => {
    const t = setup()
    await expect(
      t.action(api.tmdb.title, { ...titleArgs, tmdbId })
    ).rejects.toThrow("Invalid TMDB ID")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await titleCache(t)).toEqual([
      { payload: null, fetchedAt: 0 },
      { payload: null, fetchedAt: 0 },
    ])
  }
)

test("title returns a movie snapshot and caches the unchanged details:v2 shape", async () => {
  const t = setup()
  titleResponse()
  expect(await t.action(api.tmdb.title, titleArgs)).toEqual(moviePayload)
  expect(await titleCache(t)).toEqual([
    { payload: moviePayload, fetchedAt: expect.any(Number) },
    { payload: moviePayload.details, fetchedAt: expect.any(Number) },
  ])
  const [metadataUrl, imagesUrl] = fetchMock.mock.calls.map(
    ([input]) => new URL(String(input))
  )
  expect(metadataUrl.pathname).toBe("/3/movie/22")
  expect(metadataUrl.searchParams.get("language")).toBe("en-US")
  expect(imagesUrl.pathname).toBe("/3/movie/22/images")
  expect(imagesUrl.searchParams.get("include_image_language")).toBe("en,null")

  expect(await t.action(api.tmdb.details, titleArgs)).toEqual(
    moviePayload.details
  )
  expect(
    await t
      .withIdentity({ subject: "another-user" })
      .action(api.tmdb.title, titleArgs)
  ).toEqual(moviePayload)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test("title uses the TV name, first air date and TV details without colliding with movie cache", async () => {
  const t = setup()
  titleResponse()
  await t.action(api.tmdb.title, titleArgs)
  titleResponse({
    id: 22,
    name: "Severance",
    title: "Not the TV title",
    first_air_date: "2022-02-18",
    release_date: "2000-01-01",
    poster_path: "/severance.jpg",
    number_of_seasons: 2,
    number_of_episodes: 19,
    seasons: [
      {
        season_number: 1,
        name: "Season 1",
        episode_count: 9,
        air_date: "2022-02-18",
        poster_path: "/season.jpg",
      },
    ],
    next_episode_to_air: {
      season_number: 2,
      episode_number: 4,
      name: "Next",
      air_date: "2025-02-07",
    },
    last_episode_to_air: {
      season_number: 2,
      episode_number: 3,
      still_path: "/last.jpg",
    },
  })
  const payload = await t.action(api.tmdb.title, {
    mediaType: "tv",
    tmdbId: 22,
  })
  expect(payload).toEqual({
    item: {
      tmdbId: 22,
      mediaType: "tv",
      title: "Severance",
      posterPath: "/severance.jpg",
      year: "2022",
    },
    details: {
      overview: null,
      tagline: null,
      genres: [],
      runtime: null,
      numberOfSeasons: 2,
      numberOfEpisodes: 19,
      voteAverage: null,
      releaseDate: "2022-02-18",
      backdropPath: null,
      logoPath: "/english.png",
      status: null,
      seasons: [
        {
          season: 1,
          name: "Season 1",
          episodeCount: 9,
          airDate: "2022-02-18",
          posterPath: "/season.jpg",
        },
      ],
      nextEpisode: {
        season: 2,
        episode: 4,
        name: "Next",
        airDate: "2025-02-07",
        stillPath: null,
      },
      lastEpisode: {
        season: 2,
        episode: 3,
        name: null,
        airDate: null,
        stillPath: "/last.jpg",
      },
    },
  })
  const urls = fetchMock.mock.calls
    .slice(2)
    .map(([input]) => new URL(String(input)).pathname)
  expect(urls).toEqual(["/3/tv/22", "/3/tv/22/images"])
  const [cached] = await t.query(internal.tmdb_cache.getBatch, {
    keys: ["title:tv:22:v1"],
  })
  expect(cached.payload).toEqual(payload)
  expect(await t.action(api.tmdb.title, titleArgs)).toEqual(moviePayload)
  expect(fetchMock).toHaveBeenCalledTimes(4)
})

test("title tolerates absent optional snapshot fields and caches a valid empty artwork list", async () => {
  const t = setup()
  titleResponse({ id: 22, title: "Film" }, { logos: [] })
  const payload = await t.action(api.tmdb.title, titleArgs)
  expect(payload?.item).toEqual({
    tmdbId: 22,
    mediaType: "movie",
    title: "Film",
    year: null,
    posterPath: null,
  })
  expect(payload?.details.logoPath).toBeNull()
  expect((await titleCache(t))[0].payload).toEqual(payload)
})

test.each([false, true])(
  "title respects the 12-hour TTL (expired: %s)",
  async (expired) => {
    const t = setup()
    const fetchedAt = Date.now() - detailsTtl + (expired ? 0 : 60_000)
    await t.mutation(internal.tmdb_cache.putBatch, {
      entries: [{ key: titleKey, payload: moviePayload, fetchedAt }],
    })
    titleResponse()
    expect(await t.action(api.tmdb.title, titleArgs)).toEqual(moviePayload)
    expect(fetchMock).toHaveBeenCalledTimes(expired ? 2 : 0)
    const [cached] = await titleCache(t)
    if (expired) expect(cached.fetchedAt).toBeGreaterThan(fetchedAt)
    else expect(cached.fetchedAt).toBe(fetchedAt)
  }
)

test("a metadata 404 returns null without caching despite concurrent artwork", async () => {
  const t = setup()
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }))
  expect(await t.action(api.tmdb.title, titleArgs)).toBeNull()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect((await titleCache(t)).every((entry) => entry.payload === null)).toBe(
    true
  )
})

test.each(["movie", "tv"] as const)(
  "adult %s titles return null without caching concurrent artwork",
  async (mediaType) => {
    const t = setup()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 22,
        adult: true,
        title: "Hidden film",
        name: "Hidden show",
      })
    )
    expect(await t.action(api.tmdb.title, { mediaType, tmdbId: 22 })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const cached = await t.query(internal.tmdb_cache.getBatch, {
      keys: [`title:${mediaType}:22:v1`, `details:${mediaType}:22:v2`],
    })
    expect(cached.every((entry) => entry.payload === null)).toBe(true)
  }
)

test.each([401, 429, 500, 503])(
  "title propagates metadata HTTP %s instead of returning not found",
  async (status) => {
    const t = setup()
    fetchMock.mockResolvedValueOnce(new Response(null, { status }))
    await expect(t.action(api.tmdb.title, titleArgs)).rejects.toThrow(
      `status ${status}`
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((await titleCache(t)).every((entry) => entry.payload === null)).toBe(
      true
    )
  }
)

test("title does not infer a 404 from an unrelated error message", async () => {
  const t = setup()
  fetchMock.mockRejectedValueOnce(
    new Error("TMDB request failed with status 404")
  )
  await expect(t.action(api.tmdb.title, titleArgs)).rejects.toThrow(
    "status 404"
  )
  expect((await titleCache(t)).every((entry) => entry.payload === null)).toBe(
    true
  )
})

test.each([
  null,
  [],
  "not an object",
  {},
  { ...movieData, id: "22" },
  { ...movieData, id: 23 },
  { ...movieData, title: null },
  { ...movieData, title: "  " },
  { ...movieData, media_type: "tv" },
  { ...movieData, adult: "true" },
  { ...movieData, genres: [null] },
  { ...movieData, seasons: [null] },
  { ...movieData, seasons: {} },
])("title rejects malformed metadata safely: %j", async (data) => {
  const t = setup()
  fetchMock.mockResolvedValueOnce(jsonResponse(data))
  await expect(t.action(api.tmdb.title, titleArgs)).rejects.toThrow(
    "Invalid TMDB title response"
  )
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect((await titleCache(t)).every((entry) => entry.payload === null)).toBe(
    true
  )
})

test("title propagates invalid metadata JSON without caching it", async () => {
  const t = setup()
  fetchMock.mockResolvedValueOnce(new Response("invalid JSON", { status: 200 }))
  await expect(t.action(api.tmdb.title, titleArgs)).rejects.toThrow()
  expect((await titleCache(t)).every((entry) => entry.payload === null)).toBe(
    true
  )
})

test.each([
  ["404", () => new Response(null, { status: 404 })],
  ["503", () => new Response(null, { status: 503 })],
  [
    "network failure",
    () => {
      throw new Error("Network unavailable")
    },
  ],
  ["invalid JSON", () => new Response("invalid JSON", { status: 200 })],
  ["null payload", () => jsonResponse(null)],
  ["missing logos", () => jsonResponse({})],
  ["malformed logo", () => jsonResponse({ logos: [null] })],
  ["missing logo path", () => jsonResponse({ logos: [{}] })],
] as const)(
  "artwork %s preserves metadata and the full shared cache, and can retry",
  async (_label, imagesResponse) => {
    const t = setup()
    const fullEntry = {
      key: detailsKey,
      payload: { ...moviePayload.details, logoPath: "/previous.png" },
      fetchedAt: Date.now() - 1_000,
    }
    await t.mutation(internal.tmdb_cache.putBatch, { entries: [fullEntry] })
    fetchMock.mockResolvedValueOnce(jsonResponse(movieData))
    fetchMock.mockImplementationOnce(async () => imagesResponse())
    expect(await t.action(api.tmdb.title, titleArgs)).toEqual({
      ...moviePayload,
      details: { ...moviePayload.details, logoPath: null },
    })
    expect(await titleCache(t)).toEqual([
      { payload: null, fetchedAt: 0 },
      { payload: fullEntry.payload, fetchedAt: fullEntry.fetchedAt },
    ])

    titleResponse()
    expect(await t.action(api.tmdb.title, titleArgs)).toEqual(moviePayload)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect((await titleCache(t))[0].payload).toEqual(moviePayload)
  }
)

test("existing details still rejects artwork failures and does not cache partial details", async () => {
  const t = setup()
  fetchMock.mockResolvedValueOnce(jsonResponse(movieData))
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
  await expect(t.action(api.tmdb.details, titleArgs)).rejects.toThrow("503")
  expect((await titleCache(t))[1].payload).toBeNull()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test("cold title starts metadata and artwork together, not one network delay after another", async () => {
  const metadata = deferred<Response>()
  const artwork = deferred<Response>()
  const imagesStarted = deferred<void>()
  fetchMock.mockImplementationOnce(() => metadata.promise)
  fetchMock.mockImplementationOnce(() => {
    imagesStarted.resolve()
    return artwork.promise
  })
  let finished = false
  const result = setup()
    .action(api.tmdb.title, titleArgs)
    .then((value) => {
      finished = true
      return value
    })
  // Reaching this barrier while metadata is unresolved proves the network
  // delays overlap. A serial implementation times out here.
  await imagesStarted.promise
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(finished).toBe(false)
  artwork.resolve(jsonResponse(titleImages))
  expect(finished).toBe(false)
  metadata.resolve(jsonResponse(movieData))
  expect(await result).toEqual(moviePayload)
})

test.each([404, 503])(
  "metadata HTTP %s settles before pending artwork",
  async (status) => {
    const artwork = deferred<Response>()
    fetchMock.mockResolvedValueOnce(new Response(null, { status }))
    fetchMock.mockImplementationOnce(() => artwork.promise)
    const result = setup().action(api.tmdb.title, titleArgs)
    if (status === 404) await expect(result).resolves.toBeNull()
    else await expect(result).rejects.toThrow("503")
    artwork.resolve(jsonResponse(titleImages))
  }
)
