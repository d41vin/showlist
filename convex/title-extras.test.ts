import { convexTest } from "convex-test"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

// Match the existing tests: vite/client is not a direct project dependency.
const modules = (
  import.meta as unknown as {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>
  }
).glob("./**/*.ts")
const fetchMock = vi.fn<typeof fetch>()
const setup = () =>
  convexTest(schema, modules).withIdentity({ subject: "extras-test" })
const titleArgs = { mediaType: "movie", tmdbId: 22 } as const
const entityArgs = {
  kind: "person",
  id: "9",
  mediaType: "all",
  sort: "popularity",
} as const
const extrasKey = "extras:movie:22:v2"
const hour = 60 * 60 * 1000
const emptyExtras = {
  genres: [],
  countries: [],
  companies: [],
  alternativeTitles: [],
  cast: [],
  crew: [],
  backdrops: [],
}
const completeMovie = {
  id: 22,
  title: "Film",
  credits: { cast: [], crew: [] },
  alternative_titles: { titles: [] },
  images: { backdrops: [] },
}

beforeEach(() => {
  vi.stubEnv("TMDB_API_KEY", "test-key")
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
function json(value: unknown) {
  return new Response(JSON.stringify(value))
}
function respond(value: unknown) {
  fetchMock.mockResolvedValueOnce(json(value))
}
function urls() {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input)))
}
async function cache(t: ReturnType<typeof setup>, keys: string[]) {
  return t.query(internal.tmdb_cache.getBatch, { keys })
}
function movie(id: number, rest: Record<string, unknown> = {}) {
  return { id, title: `Film ${id}`, media_type: "movie", ...rest }
}
function show(id: number, rest: Record<string, unknown> = {}) {
  return { id, name: `Show ${id}`, media_type: "tv", ...rest }
}

test("every public TMDB action authenticates before fetch or a warm-cache read", async () => {
  const t = convexTest(schema, modules)
  await t.mutation(internal.tmdb_cache.putBatch, {
    entries: [
      { key: extrasKey, payload: emptyExtras, fetchedAt: Date.now() },
      {
        key: "recs:movie:22:1:v2",
        payload: { items: [], hasMore: false },
        fetchedAt: Date.now(),
      },
      { key: "person-credits:9:v1", payload: [], fetchedAt: Date.now() },
    ],
  })
  const calls = [
    () => t.action(api.tmdb.search, { query: "Film" }),
    () => t.action(api.tmdb.title, titleArgs),
    () => t.action(api.tmdb.titleExtras, titleArgs),
    () => t.action(api.tmdb.details, titleArgs),
    () => t.action(api.tmdb.tvSeason, { tmdbId: 22, season: 1 }),
    () => t.action(api.tmdb.recommendations, titleArgs),
    () => t.action(api.tmdb.entitySearch, entityArgs),
    () => t.action(api.tmdb.videos, titleArgs),
    () => t.action(api.tmdb.genres, { mediaType: "movie" }),
    () => t.action(api.tmdb.watchProviders, {}),
    () =>
      t.action(api.tmdb.discover, {
        mediaType: "movie",
        genre: 1,
        sort: "newest",
      }),
    () => t.action(api.tmdb.discoverTrending, { mediaType: "all" }),
    () => t.action(api.tmdb.discoverPopular, { mediaType: "movie" }),
    () => t.action(api.tmdb.discoverTopRated, { mediaType: "tv" }),
    () => t.action(api.tmdb.discoverNowPlaying, { mediaType: "tv" }),
  ]
  for (const call of calls)
    await expect(call()).rejects.toThrow("Not signed in")
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity])(
  "extras and recommendations reject unsafe ID %s",
  async (tmdbId) => {
    const t = setup()
    await expect(
      t.action(api.tmdb.titleExtras, { ...titleArgs, tmdbId })
    ).rejects.toThrow("Invalid TMDB ID")
    await expect(
      t.action(api.tmdb.recommendations, { ...titleArgs, tmdbId })
    ).rejects.toThrow("Invalid TMDB ID")
    expect(fetchMock).not.toHaveBeenCalled()
  }
)

test("movie extras normalize entities, aliases, billing, jobs and a bounded landscape gallery", async () => {
  const t = setup()
  respond({
    ...completeMovie,
    original_title: "Original Film",
    genres: [
      null,
      { id: 1, name: "Drama" },
      { id: 1, name: "Duplicate" },
      { id: -1, name: "No" },
      { id: 2 },
    ],
    production_countries: [
      null,
      { iso_3166_1: "US", name: "United States" },
      { iso_3166_1: "US", name: "Duplicate" },
      { iso_3166_1: "BAD", name: "Invalid" },
    ],
    production_companies: [
      false,
      { id: 7, name: "Studio" },
      { id: 7, name: "Duplicate" },
      { id: "8", name: "Invalid" },
    ],
    alternative_titles: {
      titles: [
        null,
        { title: " Film " },
        { title: "original film" },
        { title: "Alias" },
        { title: " alias " },
        { title: 7 },
      ],
    },
    credits: {
      cast: [
        { id: 2, name: "Second", character: "B", order: 2 },
        { id: 1, name: "First", character: "A", order: 0 },
        { id: 1, name: "First", character: "A", order: 0 },
        null,
        { id: 3, name: "Hidden", adult: true },
        { id: 0, name: "Bad" },
      ],
      crew: [
        { id: 4, name: "Director", job: "Director" },
        { id: 4, name: "Director", job: "Writer" },
        { id: 4, name: "Director", job: "Director" },
        { id: 5, name: "Unknown job" },
      ],
    },
    images: {
      backdrops: [
        null,
        {
          file_path: "https://other.test/image.jpg",
          width: 1920,
          height: 1080,
        },
        { file_path: "/portrait.jpg", width: 1080, height: 1920 },
        { file_path: "/tiny.jpg", width: 500, height: 280 },
        { file_path: "/bad.jpg", width: "1920", height: 1080 },
        { file_path: "/zero.jpg", width: 1920, height: 0 },
        ...Array.from({ length: 12 }, (_, i) => ({
          file_path: `/landscape${i}.jpg`,
          width: 1920,
          height: 1080,
          vote_average: 10 - i / 10,
        })),
        {
          file_path: "/landscape0.jpg",
          width: 1920,
          height: 1080,
          vote_average: 10,
        },
      ],
    },
  })
  const result = await t.action(api.tmdb.titleExtras, titleArgs)
  expect(result).toEqual({
    genres: [{ id: 1, name: "Drama" }],
    countries: [{ code: "US", name: "United States" }],
    companies: [{ id: 7, name: "Studio" }],
    alternativeTitles: ["Original Film", "Alias"],
    cast: [
      { id: 1, name: "First", role: "A" },
      { id: 2, name: "Second", role: "B" },
    ],
    crew: [
      { id: 4, name: "Director", role: "Director, Writer" },
      { id: 5, name: "Unknown job", role: "" },
    ],
    backdrops: Array.from({ length: 10 }, (_, i) => `/landscape${i}.jpg`),
  })
  const [url] = urls()
  expect(url.pathname).toBe("/3/movie/22")
  expect(url.searchParams.get("append_to_response")).toBe(
    "credits,alternative_titles,images"
  )
  expect(url.searchParams.get("include_image_language")).toBe("en,null")
  expect(url.searchParams.get("language")).toBe("en-US")
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect((await cache(t, [extrasKey]))[0].payload).toEqual(result)
})

test("TV extras use aggregate roles/jobs and TV alternative-title results without episode requests", async () => {
  respond({
    id: 22,
    name: "Show",
    original_name: "Show",
    origin_country: ["GB", null, "Invalid"],
    aggregate_credits: {
      cast: [
        { id: 2, name: "Second", order: 1, roles: [{ character: "Guest" }] },
        {
          id: 1,
          name: "Lead",
          order: 0,
          roles: [
            { character: "Hero" },
            { character: "Hero" },
            null,
            { character: "Narrator" },
          ],
        },
        { id: 1, name: "Lead", order: 0, roles: [{ character: "Older Hero" }] },
        { id: 3, name: "No role", roles: "broken" },
      ],
      crew: [
        {
          id: 4,
          name: "Creator",
          jobs: [{ job: "Writer" }, { job: "Producer" }, null],
        },
        { id: 4, name: "Creator", jobs: [{ job: "Writer" }] },
      ],
    },
    alternative_titles: {
      results: [{ title: "Another Show" }, { title: "Show" }],
      titles: [{ title: "Wrong endpoint" }],
    },
    images: { backdrops: [] },
  })
  expect(
    await setup().action(api.tmdb.titleExtras, { mediaType: "tv", tmdbId: 22 })
  ).toEqual({
    ...emptyExtras,
    countries: [{ code: "GB", name: "GB" }],
    alternativeTitles: ["Another Show"],
    cast: [
      { id: 1, name: "Lead", role: "Hero, Narrator, Older Hero" },
      { id: 2, name: "Second", role: "Guest" },
      { id: 3, name: "No role", role: "" },
    ],
    crew: [{ id: 4, name: "Creator", role: "Writer, Producer" }],
  })
  expect(urls()[0].pathname).toBe("/3/tv/22")
  expect(urls()[0].searchParams.get("append_to_response")).toBe(
    "aggregate_credits,alternative_titles,images"
  )
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test.each([
  {},
  { genres: [null], production_countries: {}, production_companies: null },
])(
  "optional metadata can be absent when append sections are complete: %j",
  async (metadata) => {
    const t = setup()
    respond({ ...completeMovie, ...metadata })
    expect(await t.action(api.tmdb.titleExtras, titleArgs)).toEqual(emptyExtras)
    expect((await cache(t, [extrasKey]))[0].payload).toEqual(emptyExtras)
    expect(await t.action(api.tmdb.titleExtras, titleArgs)).toEqual(emptyExtras)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  }
)

test.each(["movie", "tv"] as const)(
  "missing %s append sections throw without caching and a retry succeeds",
  async (mediaType) => {
    const t = setup()
    const args = { mediaType, tmdbId: 22 }
    const key = `extras:${mediaType}:22:v2`
    respond({ id: 22, title: "Film", name: "Show" })
    await expect(t.action(api.tmdb.titleExtras, args)).rejects.toThrow(
      "Incomplete TMDB extras response"
    )
    expect((await cache(t, [key]))[0].payload).toBeNull()
    respond({
      ...completeMovie,
      name: "Show",
      aggregate_credits: { cast: [], crew: [] },
      alternative_titles: { titles: [], results: [] },
    })
    expect(await t.action(api.tmdb.titleExtras, args)).toEqual(emptyExtras)
    expect((await cache(t, [key]))[0].payload).toEqual(emptyExtras)
    expect(await t.action(api.tmdb.titleExtras, args)).toEqual(emptyExtras)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  }
)

test("extras caches are separate from movie/TV title snapshots and shared details:v2", async () => {
  const t = setup()
  const sharedKeys = [
    "details:movie:22:v2",
    "title:movie:22:v1",
    "extras:tv:22:v2",
  ]
  await t.mutation(internal.tmdb_cache.putBatch, {
    entries: sharedKeys.map((key) => ({
      key,
      payload: { untouched: key },
      fetchedAt: Date.now(),
    })),
  })
  const before = await cache(t, sharedKeys)
  respond(completeMovie)
  const extras = await t.action(api.tmdb.titleExtras, titleArgs)
  expect(
    await t
      .withIdentity({ subject: "another-user" })
      .action(api.tmdb.titleExtras, titleArgs)
  ).toEqual(extras)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(await cache(t, sharedKeys)).toEqual(before)
})

test.each([false, true])(
  "extras honor their independent 12h TTL (expired %s)",
  async (expired) => {
    const t = setup()
    await t.mutation(internal.tmdb_cache.putBatch, {
      entries: [
        {
          key: extrasKey,
          payload: emptyExtras,
          fetchedAt: Date.now() - 12 * hour + (expired ? 0 : 60_000),
        },
      ],
    })
    respond(completeMovie)
    await t.action(api.tmdb.titleExtras, titleArgs)
    expect(fetchMock).toHaveBeenCalledTimes(expired ? 1 : 0)
  }
)

test.each([
  ["credits", undefined],
  ["credits", { success: false, cast: [], crew: [] }],
  ["credits", { status_code: 25, cast: [], crew: [] }],
  ["credits", { cast: [] }],
  ["credits", { crew: [] }],
  ["credits", null],
  ["alternative_titles", undefined],
  ["alternative_titles", { success: false, titles: [], results: [] }],
  ["alternative_titles", {}],
  ["images", undefined],
  ["images", { success: false, backdrops: [] }],
  ["images", { status_code: 34, backdrops: [] }],
  ["images", { backdrops: "broken" }],
] as const)(
  "incomplete append %s (%j) throws, preserves stale cache and allows retry",
  async (section, response) => {
    for (const mediaType of ["movie", "tv"] as const) {
      const t = setup()
      const args = { mediaType, tmdbId: 22 }
      const key = `extras:${mediaType}:22:v2`
      const creditsKey = mediaType === "movie" ? "credits" : "aggregate_credits"
      const appendKey = section === "credits" ? creditsKey : section
      const complete = {
        id: 22,
        title: "Film",
        name: "Show",
        [creditsKey]: { cast: [], crew: [] },
        alternative_titles: {
          [mediaType === "movie" ? "titles" : "results"]: [],
        },
        images: { backdrops: [] },
      }
      const previous = {
        key,
        payload: { ...emptyExtras, alternativeTitles: ["Previous"] },
        fetchedAt: Date.now() - 13 * hour,
      }
      await t.mutation(internal.tmdb_cache.putBatch, { entries: [previous] })
      respond({ ...complete, [appendKey]: response })
      await expect(t.action(api.tmdb.titleExtras, args)).rejects.toThrow(
        `Incomplete TMDB extras response: ${appendKey}`
      )
      expect((await cache(t, [key]))[0]).toEqual({
        payload: previous.payload,
        fetchedAt: previous.fetchedAt,
      })
      respond(complete)
      expect(await t.action(api.tmdb.titleExtras, args)).toEqual(emptyExtras)
      expect((await cache(t, [key]))[0].payload).toEqual(emptyExtras)
      expect(await t.action(api.tmdb.titleExtras, args)).toEqual(emptyExtras)
    }
    expect(fetchMock).toHaveBeenCalledTimes(4)
  }
)

test.each(["movie", "tv"] as const)(
  "extras hide adult and missing %s titles",
  async (mediaType) => {
    const t = setup()
    respond({ id: 22, adult: true })
    expect(
      await t.action(api.tmdb.titleExtras, { mediaType, tmdbId: 22 })
    ).toBeNull()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }))
    expect(
      await t.action(api.tmdb.titleExtras, { mediaType, tmdbId: 22 })
    ).toBeNull()
    expect(
      (await cache(t, [`extras:${mediaType}:22:v2`]))[0].payload
    ).toBeNull()
  }
)

test.each([
  null,
  [],
  {},
  { id: 23, title: "Film" },
  { id: 22, title: "" },
  { id: 22, title: "Film", adult: "true" },
  { id: 22, title: "Film", media_type: "tv" },
])("extras reject invalid metadata: %j", async (data) => {
  const t = setup()
  respond(data)
  await expect(t.action(api.tmdb.titleExtras, titleArgs)).rejects.toThrow(
    "Invalid TMDB extras response"
  )
  expect((await cache(t, [extrasKey]))[0].payload).toBeNull()
})

test.each(["movie", "tv"] as const)(
  "%s extras retain every deduped person and late directors with bounded text",
  async (mediaType) => {
    const t = setup()
    const people = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      name: "名".repeat(1000),
      character: "Role".repeat(1000),
      job: "Job".repeat(1000),
      roles: [{ character: "Role".repeat(1000) }],
      jobs: [{ job: "Job".repeat(1000) }],
      order: i,
    }))
    const director = {
      id: 201,
      name: "Late director",
      job: "Director",
      jobs: [{ job: "Director" }],
    }
    respond({
      ...completeMovie,
      name: "Show",
      [mediaType === "movie" ? "credits" : "aggregate_credits"]: {
        cast: [...people].reverse().concat([people[0], people[199]]),
        crew: [
          ...people,
          director,
          { ...director, job: "Writer", jobs: [{ job: "Writer" }] },
        ],
      },
      alternative_titles: {
        [mediaType === "movie" ? "titles" : "results"]: Array.from(
          { length: 100 },
          (_, i) => ({ title: `${i}${"名".repeat(1000)}` })
        ),
      },
    })
    const result = await t.action(api.tmdb.titleExtras, {
      mediaType,
      tmdbId: 22,
    })
    expect(result?.cast.map((person) => person.id)).toEqual(
      people.map((p) => p.id)
    )
    expect(result?.crew.map((person) => person.id)).toEqual([
      ...people.map((p) => p.id),
      201,
    ])
    expect(result?.crew.at(-1)).toEqual({
      id: 201,
      name: "Late director",
      role: "Director, Writer",
    })
    expect(result?.alternativeTitles).toHaveLength(50)
    for (const kind of ["cast", "crew"] as const) {
      expect(
        result?.[kind].every(
          (p) => p.name.length <= 200 && p.role.length <= 300
        )
      ).toBe(true)
    }
    expect(
      new TextEncoder().encode(JSON.stringify(result)).byteLength
    ).toBeLessThan(700_000)
    expect((await cache(t, [`extras:${mediaType}:22:v2`]))[0].payload).toEqual(
      result
    )
  }
)

test.each([false, true])(
  "oversized extras return all credits without caching (stale cache %s)",
  async (stale) => {
    const t = setup()
    if (stale) {
      await t.mutation(internal.tmdb_cache.putBatch, {
        entries: [
          {
            key: extrasKey,
            payload: { ...emptyExtras, alternativeTitles: ["Previous"] },
            fetchedAt: Date.now() - 13 * hour,
          },
        ],
      })
    }
    const before = await cache(t, [extrasKey])
    const people = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      name: "名".repeat(200),
      character: "R".repeat(100),
      job: "J".repeat(100),
    }))
    const response = {
      ...completeMovie,
      credits: { cast: people, crew: people },
    }
    respond(response)
    const result = await t.action(api.tmdb.titleExtras, titleArgs)
    expect(result?.cast).toEqual(
      people.map(({ id, name, character }) => ({ id, name, role: character }))
    )
    expect(result?.crew).toEqual(
      people.map(({ id, name, job }) => ({ id, name, role: job }))
    )
    expect(JSON.stringify(result).length).toBeLessThan(700_000)
    expect(
      new TextEncoder().encode(JSON.stringify(result)).byteLength
    ).toBeGreaterThan(700_000)
    expect(await cache(t, [extrasKey])).toEqual(before)
    respond(response)
    expect(await t.action(api.tmdb.titleExtras, titleArgs)).toEqual(result)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await cache(t, [extrasKey])).toEqual(before)
  }
)

test.each(["cast", "crew"] as const)(
  "extras respect the 8192-person Convex array limit for %s after deduping",
  async (kind) => {
    for (const count of [8192, 8193]) {
      const t = setup()
      const people = Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        name: `Person ${i + 1}`,
      }))
      respond({
        ...completeMovie,
        credits: { cast: [], crew: [], [kind]: [...people, people[0]] },
      })
      const result = t.action(api.tmdb.titleExtras, titleArgs)
      if (count === 8192) {
        expect((await result)?.[kind]).toHaveLength(count)
        expect((await cache(t, [extrasKey]))[0].payload).toEqual(await result)
      } else {
        await expect(result).rejects.toThrow("8192-person array limit")
        expect((await cache(t, [extrasKey]))[0].payload).toBeNull()
      }
    }
  }
)

test.each([0, -1, 1.1, 501, NaN, Infinity, -Infinity])(
  "recommendations/entity search reject invalid page %s",
  async (page) => {
    const t = setup()
    await expect(
      t.action(api.tmdb.recommendations, { ...titleArgs, page })
    ).rejects.toThrow("Invalid page")
    await expect(
      t.action(api.tmdb.entitySearch, { ...entityArgs, page })
    ).rejects.toThrow("Invalid page")
    expect(fetchMock).not.toHaveBeenCalled()
  }
)

test.each(["movie", "tv"] as const)(
  "%s recommendation pages filter, dedupe and use versioned per-page caches",
  async (mediaType) => {
    const t = setup()
    await t.mutation(internal.tmdb_cache.putBatch, {
      entries: [
        {
          key: `recs:${mediaType}:22:v1`,
          payload: [{ legacy: true }],
          fetchedAt: Date.now(),
        },
      ],
    })
    const row = mediaType === "movie" ? movie : show
    respond({
      results: [
        row(1),
        row(1),
        row(2, { adult: true }),
        null,
        [],
        row(-1),
        row(3, { adult: "false" }),
        row(4, { title: "", name: "" }),
        row(5, { media_type: mediaType === "tv" ? "movie" : "tv" }),
        row(6, { id: "6" }),
      ],
      total_pages: 2,
    })
    const args = { mediaType, tmdbId: 22 }
    const first = await t.action(api.tmdb.recommendations, args)
    expect(first.items.map((item) => item.tmdbId)).toEqual([1])
    expect(first.hasMore).toBe(true)
    respond({ results: [row(7)], total_pages: 2 })
    expect(
      await t.action(api.tmdb.recommendations, { ...args, page: 2 })
    ).toMatchObject({ items: [{ tmdbId: 7 }], hasMore: false })
    expect(await t.action(api.tmdb.recommendations, args)).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      urls().map((url) => [url.pathname, url.searchParams.get("page")])
    ).toEqual([
      [`/3/${mediaType}/22/recommendations`, "1"],
      [`/3/${mediaType}/22/recommendations`, "2"],
    ])
    expect((await cache(t, [`recs:${mediaType}:22:1:v2`]))[0].payload).toEqual(
      first
    )
  }
)

test.each([
  [499, 100000, true],
  [500, 100000, false],
  [1, -1, false],
  [1, "5", false],
  [1, null, false],
  [1, 1.9, false],
] as const)(
  "recommendations clamp external page counts (%s, %s)",
  async (page, total_pages, hasMore) => {
    respond({ results: [movie(1, { adult: true })], total_pages })
    expect(
      await setup().action(api.tmdb.recommendations, { ...titleArgs, page })
    ).toEqual({ items: [], hasMore })
  }
)

test("recommendations refresh after 24h and never reuse another media type's cache", async () => {
  const t = setup()
  await t.mutation(internal.tmdb_cache.putBatch, {
    entries: [
      {
        key: "recs:movie:22:1:v2",
        payload: { items: [], hasMore: false },
        fetchedAt: Date.now() - 24 * hour,
      },
      {
        key: "recs:tv:22:1:v2",
        payload: { items: [], hasMore: true },
        fetchedAt: Date.now(),
      },
    ],
  })
  respond({ results: [movie(8)], total_pages: 1 })
  expect(
    (await t.action(api.tmdb.recommendations, titleArgs)).items[0].tmdbId
  ).toBe(8)
  expect(
    await t.action(api.tmdb.recommendations, { mediaType: "tv", tmdbId: 22 })
  ).toEqual({ items: [], hasMore: true })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test.each([
  { kind: "country", id: "USA" },
  { kind: "country", id: "U1" },
  { kind: "country", id: "ß" },
  { id: "0" },
  { id: "-2" },
  { id: "1.5" },
  { id: "01" },
  { id: "1|2" },
  { id: "9007199254740992" },
  { id: " 1 " },
  { id: "" },
  { kind: "genre", mediaType: "all" },
  { kind: "company", credit: "cast" },
  { sort: "rating" },
  { kind: "other" },
  { mediaType: "person" },
  { credit: "director" },
  { q: "text" },
])("entity search rejects invalid public input: %j", async (invalid) => {
  await expect(
    setup().action(api.tmdb.entitySearch, {
      ...entityArgs,
      ...invalid,
    } as never)
  ).rejects.toThrow()
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each(["movie", "tv"] as const)(
  "entity filters and sorts use documented %s discover params",
  async (mediaType) => {
    for (const [kind, id, param] of [
      ["genre", "18", "with_genres"],
      ["company", "7", "with_companies"],
      ["country", "us", "with_origin_country"],
    ] as const) {
      for (const sort of ["newest", "popularity"] as const) {
        respond({
          results: [{ id: 1, title: "Film", name: "Show" }],
          total_pages: 3,
        })
        const result = await setup().action(api.tmdb.entitySearch, {
          kind,
          id,
          mediaType,
          sort,
          page: 2,
        })
        expect(result).toMatchObject({
          items: [
            { mediaType, title: mediaType === "movie" ? "Film" : "Show" },
          ],
          hasMore: true,
        })
        const url = urls().at(-1)!
        expect(url.pathname).toBe(`/3/discover/${mediaType}`)
        expect(url.searchParams.get(param)).toBe(kind === "country" ? "US" : id)
        expect(url.searchParams.get("sort_by")).toBe(
          sort === "popularity"
            ? "popularity.desc"
            : mediaType === "movie"
              ? "primary_release_date.desc"
              : "first_air_date.desc"
        )
        expect(url.searchParams.get("page")).toBe("2")
        expect(url.searchParams.get("include_adult")).toBe("false")
        expect(url.searchParams.has("with_people")).toBe(false)
        expect(url.searchParams.has("query")).toBe(false)
      }
    }
  }
)

test("all-type discover requests start in parallel and interleave filtered pages", async () => {
  let movieDone!: (response: Response) => void
  let tvDone!: (response: Response) => void
  let bothStarted!: () => void
  const started = new Promise<void>((resolve) => {
    bothStarted = resolve
  })
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        movieDone = resolve
      })
  )
  fetchMock.mockImplementationOnce(() => {
    bothStarted()
    return new Promise<Response>((resolve) => {
      tvDone = resolve
    })
  })
  const result = setup().action(api.tmdb.entitySearch, {
    kind: "company",
    id: "7",
    mediaType: "all",
    sort: "popularity",
    page: 2,
  })
  await started
  movieDone(
    json({
      results: [movie(1), movie(1), null, movie(2), show(5)],
      total_pages: 2,
    })
  )
  tvDone(
    json({
      results: [show(1), show(3, { adult: true }), show(4)],
      total_pages: 4,
    })
  )
  expect((await result).items.map((i) => `${i.mediaType}:${i.tmdbId}`)).toEqual(
    ["movie:1", "tv:1", "movie:2", "tv:4"]
  )
  expect((await result).hasMore).toBe(true)
  expect(urls().map((u) => u.pathname)).toEqual([
    "/3/discover/movie",
    "/3/discover/tv",
  ])
  expect(
    urls().every(
      (u) =>
        u.searchParams.get("page") === "2" &&
        u.searchParams.get("with_companies") === "7"
    )
  ).toBe(true)
})

test("person filmography dedupes across roles, sorts before paging and shares a bounded 24h cache", async () => {
  const t = setup()
  respond({
    id: 9,
    cast: [
      ...Array.from({ length: 25 }, (_, i) =>
        movie(i + 1, {
          popularity: i + 1,
          release_date: `20${String(i).padStart(2, "0")}-01-01`,
          character: "Hero",
        })
      ),
      movie(25),
      show(25, { popularity: 50, first_air_date: "2025-01-01" }),
      movie(31, { adult: true }),
      movie(32, { adult: "true" }),
      movie(-1),
      null,
      { id: 33, name: "Person", media_type: "person" },
      { id: 34, title: "No type" },
    ],
    crew: [
      movie(25, { job: "Writer" }),
      movie(25, { job: "Director" }),
      movie(40, {
        popularity: 100,
        release_date: "1990-01-01",
        job: "Producer",
      }),
    ],
  })
  const first = await t.action(api.tmdb.entitySearch, entityArgs)
  expect(first.items).toHaveLength(20)
  expect(first.hasMore).toBe(true)
  expect(
    first.items.slice(0, 3).map((i) => `${i.mediaType}:${i.tmdbId}`)
  ).toEqual(["movie:40", "tv:25", "movie:25"])
  const second = await t.action(api.tmdb.entitySearch, {
    ...entityArgs,
    page: 2,
  })
  expect(second.items).toHaveLength(7)
  expect(second.hasMore).toBe(false)
  expect(
    new Set(
      [...first.items, ...second.items].map((i) => `${i.mediaType}:${i.tmdbId}`)
    ).size
  ).toBe(27)
  expect(
    await t.action(api.tmdb.entitySearch, { ...entityArgs, page: 3 })
  ).toEqual({ items: [], hasMore: false })
  const crew = await t.action(api.tmdb.entitySearch, {
    ...entityArgs,
    credit: "crew",
    sort: "newest",
  })
  expect(crew.items.map((i) => i.tmdbId)).toEqual([25, 40])
  expect(crew.hasMore).toBe(false)
  const cast = await t.action(api.tmdb.entitySearch, {
    ...entityArgs,
    credit: "cast",
    mediaType: "movie",
    sort: "newest",
  })
  expect(cast.items[0].tmdbId).toBe(25)
  expect(cast.items.some((i) => i.tmdbId === 40)).toBe(false)
  expect(
    (await t.action(api.tmdb.entitySearch, { ...entityArgs, mediaType: "tv" }))
      .items
  ).toMatchObject([{ tmdbId: 25, mediaType: "tv" }])
  expect(
    (
      await t.action(api.tmdb.entitySearch, {
        ...entityArgs,
        mediaType: "tv",
        credit: "crew",
      })
    ).items
  ).toEqual([])
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(urls()[0].pathname).toBe("/3/person/9/combined_credits")
  expect(urls()[0].searchParams.has("page")).toBe(false)
  const [entry] = await cache(t, ["person-credits:9:v1"])
  await t.mutation(internal.tmdb_cache.putBatch, {
    entries: [
      {
        key: "person-credits:9:v1",
        payload: entry.payload,
        fetchedAt: Date.now() - 24 * hour,
      },
    ],
  })
  respond({ id: 9, cast: [], crew: [] })
  expect(await t.action(api.tmdb.entitySearch, entityArgs)).toEqual({
    items: [],
    hasMore: false,
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test("person malformed dates/popularity/paths normalize safely with deterministic sorting", async () => {
  respond({
    id: 9,
    cast: [
      movie(3, {
        popularity: "high",
        release_date: "2024-02-30",
        poster_path: "https://bad.test/x.jpg",
      }),
      movie(1, { popularity: null, release_date: "invalid" }),
      movie(2, { release_date: "2020-01-01", poster_path: "/poster.jpg" }),
    ],
    crew: [],
  })
  const result = await setup().action(api.tmdb.entitySearch, {
    ...entityArgs,
    sort: "newest",
  })
  expect(result.items.map((i) => i.tmdbId)).toEqual([2, 1, 3])
  expect(result.items[0]).toMatchObject({
    year: "2020",
    posterPath: "/poster.jpg",
  })
  expect(result.items[2]).toMatchObject({ year: null, posterPath: null })
})

test("oversized person credits paginate without truncation or an oversized cache document", async () => {
  const t = setup()
  respond({
    id: 9,
    cast: Array.from({ length: 1001 }, (_, i) => movie(i + 1)),
    crew: [],
  })
  const result = await t.action(api.tmdb.entitySearch, {
    ...entityArgs,
    page: 51,
  })
  expect(result.items.map((i) => i.tmdbId)).toEqual([1001])
  expect(result.hasMore).toBe(false)
  expect((await cache(t, ["person-credits:9:v1"]))[0].payload).toBeNull()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test.each([null, "all", "person", 1])(
  "title APIs reject invalid media type %s",
  async (mediaType) => {
    const t = setup()
    await expect(
      t.action(api.tmdb.titleExtras, { ...titleArgs, mediaType } as never)
    ).rejects.toThrow()
    await expect(
      t.action(api.tmdb.recommendations, { ...titleArgs, mediaType } as never)
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  }
)

test("person 404 is empty, malformed envelopes and JSON are failures, and none are cached", async () => {
  const t = setup()
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }))
  expect(await t.action(api.tmdb.entitySearch, entityArgs)).toEqual({
    items: [],
    hasMore: false,
  })
  for (const payload of [
    null,
    [],
    { id: 8, cast: [], crew: [] },
    { id: 9, success: false },
  ]) {
    respond(payload)
    await expect(t.action(api.tmdb.entitySearch, entityArgs)).rejects.toThrow(
      "Invalid TMDB person credits response"
    )
  }
  fetchMock.mockResolvedValueOnce(new Response("invalid JSON"))
  await expect(t.action(api.tmdb.entitySearch, entityArgs)).rejects.toThrow()
  fetchMock.mockResolvedValueOnce(new Response("invalid JSON"))
  await expect(t.action(api.tmdb.titleExtras, titleArgs)).rejects.toThrow()
  expect(
    (await cache(t, ["person-credits:9:v1", extrasKey])).every(
      (entry) => entry.payload === null
    )
  ).toBe(true)
})

test("person caches are isolated by ID", async () => {
  const t = setup()
  respond({ id: 9, cast: [movie(1)], crew: [] })
  respond({ id: 10, cast: [show(2)], crew: [] })
  expect(
    (await t.action(api.tmdb.entitySearch, entityArgs)).items[0].tmdbId
  ).toBe(1)
  expect(
    (await t.action(api.tmdb.entitySearch, { ...entityArgs, id: "10" }))
      .items[0].tmdbId
  ).toBe(2)
  expect(
    (await t.action(api.tmdb.entitySearch, entityArgs)).items[0].tmdbId
  ).toBe(1)
  expect(urls().map((url) => url.pathname)).toEqual([
    "/3/person/9/combined_credits",
    "/3/person/10/combined_credits",
  ])
})

test("explicit malformed media types are filtered rather than inferred", async () => {
  respond({
    results: [movie(1, { media_type: null }), { id: 2, title: "Inferred" }],
    total_pages: 1,
  })
  expect(
    (await setup().action(api.tmdb.recommendations, titleArgs)).items.map(
      (item) => item.tmdbId
    )
  ).toEqual([2])
})

test("country all-scope uses both discover endpoints and clamps hasMore at 500", async () => {
  respond({ results: [movie(1)], total_pages: 1000 })
  respond({ results: [], total_pages: 1000 })
  const result = await setup().action(api.tmdb.entitySearch, {
    kind: "country",
    id: "US",
    mediaType: "all",
    sort: "newest",
    page: 500,
  })
  expect(result.items).toHaveLength(1)
  expect(result.hasMore).toBe(false)
  expect(urls().map((url) => url.pathname)).toEqual([
    "/3/discover/movie",
    "/3/discover/tv",
  ])
  expect(
    urls().every((url) => url.searchParams.get("with_origin_country") === "US")
  ).toBe(true)
})

test("missing person credit sections are empty but not cached as complete", async () => {
  const t = setup()
  respond({ id: 9 })
  expect(await t.action(api.tmdb.entitySearch, entityArgs)).toEqual({
    items: [],
    hasMore: false,
  })
  expect((await cache(t, ["person-credits:9:v1"]))[0].payload).toBeNull()
})

test.each([401, 429, 500, 503])(
  "new actions propagate HTTP %s without caching failed responses",
  async (status) => {
    const t = setup()
    fetchMock.mockImplementation(async () => new Response(null, { status }))
    await expect(t.action(api.tmdb.titleExtras, titleArgs)).rejects.toThrow(
      String(status)
    )
    await expect(t.action(api.tmdb.recommendations, titleArgs)).rejects.toThrow(
      String(status)
    )
    await expect(t.action(api.tmdb.entitySearch, entityArgs)).rejects.toThrow(
      String(status)
    )
    await expect(
      t.action(api.tmdb.entitySearch, { ...entityArgs, kind: "company" })
    ).rejects.toThrow(String(status))
    expect(
      (
        await cache(t, [extrasKey, "recs:movie:22:1:v2", "person-credits:9:v1"])
      ).every((entry) => entry.payload === null)
    ).toBe(true)
  }
)

test.each([null, [], {}, { success: false, results: [] }, { results: null }])(
  "catalogue actions reject invalid envelopes: %j",
  async (payload) => {
    const t = setup()
    respond(payload)
    await expect(t.action(api.tmdb.recommendations, titleArgs)).rejects.toThrow(
      "Invalid TMDB catalogue response"
    )
    respond(payload)
    await expect(
      t.action(api.tmdb.entitySearch, {
        ...entityArgs,
        mediaType: "tv",
        kind: "company",
      })
    ).rejects.toThrow("Invalid TMDB catalogue response")
    expect((await cache(t, ["recs:movie:22:1:v2"]))[0].payload).toBeNull()
  }
)
