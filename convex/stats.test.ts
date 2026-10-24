import type { FunctionArgs } from "convex/server"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import { normalizeDetails, normalizeSeasonEpisodes } from "./tmdb"

// pnpm's transitive vite dependency cannot resolve a vite/client type reference.
const modules = (
  import.meta as unknown as {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>
  }
).glob("./**/*.ts")

const IDENTITY = {
  tokenIdentifier: "https://qa.example.com|stats-user",
  issuer: "https://qa.example.com",
  subject: "stats-user",
}
const NOW = Date.UTC(2026, 9, 23)
const HOUR = 60 * 60 * 1000
const MODES = ["cached", "uncached"] as const
const ZERO_TOTALS = {
  movieMinutes: 0,
  moviesWithRuntime: 0,
  episodeMinutes: 0,
  episodesWithRuntime: 0,
  limited: false,
}
const SEASON = {
  name: "Season one",
  air_date: "2020-01-01",
  // Out of order, so selection must use episode numbers, not array positions.
  episodes: [
    { episode_number: 9, runtime: 90 },
    {
      episode_number: 2,
      runtime: 24,
      name: "Second episode",
      overview: "Episode overview",
      air_date: "2020-01-08",
      still_path: "/still.jpg",
    },
    { episode_number: 1, runtime: 45 },
    { episode_number: 3, runtime: null },
    { episode_number: 4, runtime: 0 },
    { episode_number: 5 },
    { episode_number: 6, runtime: -10 },
    { episode_number: 7, runtime: NaN },
    { episode_number: 8, runtime: Infinity },
    { episode_number: 10, runtime: -Infinity },
    { episode_number: 11, runtime: "40" },
  ],
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW)
  vi.stubEnv("TMDB_API_KEY", "test-key")
  fetchMock.mockReset()
  fetchMock.mockRejectedValue(new Error("Unexpected TMDB request"))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function setup() {
  return convexTest(schema, modules).withIdentity(IDENTITY)
}

function jsonResponse(body: Record<string, unknown>) {
  const response = new Response(null, { status: 200 })
  // Keep non-finite values intact to exercise the runtime guard, too.
  vi.spyOn(response, "json").mockResolvedValue(body)
  return response
}

function mockTmdb(
  responses: Record<string, Record<string, unknown> | Response | Error>
) {
  fetchMock.mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname.replace(/^\/3/, "")
    const response = responses[path]
    if (response === undefined) throw new Error(`Unexpected TMDB path: ${path}`)
    if (response instanceof Error) throw response
    return response instanceof Response ? response : jsonResponse(response)
  })
}

async function cache(
  t: ReturnType<typeof setup>,
  key: string,
  payload: unknown,
  fetchedAt = NOW
) {
  await t.mutation(internal.tmdb_cache.putBatch, {
    entries: [{ key, payload, fetchedAt }],
  })
}

async function setupSeason(mode: (typeof MODES)[number]) {
  const t = setup()
  if (mode === "cached") {
    await cache(t, "tv:100:season:1:v1", normalizeSeasonEpisodes(SEASON))
  } else {
    mockTmdb({ "/tv/100/season/1": SEASON })
  }
  return t
}

test.each(MODES)(
  "one tick counts only its episode in a multi-episode %s season",
  async (mode) => {
    const t = await setupSeason(mode)
    expect(
      await t.action(api.stats.get, {
        movieIds: [],
        tvSeasons: [{ tmdbId: 100, season: 1, episodes: [2] }],
      })
    ).toEqual({ ...ZERO_TOTALS, episodeMinutes: 24, episodesWithRuntime: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(mode === "cached" ? 0 : 1)
  }
)

test.each(MODES)(
  "%s selection counts only finite, positive episode runtimes",
  async (mode) => {
    const t = await setupSeason(mode)
    expect(
      await t.action(api.stats.get, {
        movieIds: [],
        tvSeasons: [
          {
            tmdbId: 100,
            season: 1,
            episodes: [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 999],
          },
        ],
      })
    ).toEqual({ ...ZERO_TOTALS, episodeMinutes: 69, episodesWithRuntime: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(mode === "cached" ? 0 : 1)
  }
)

test.each(MODES)(
  "merges duplicate %s seasons and episodes, keeping shows and specials distinct",
  async (mode) => {
    const t = setup()
    const selections = [
      { tmdbId: 100, season: 1, episodes: [2, 2] },
      { tmdbId: 100, season: 1, episodes: [1, 2] },
      { tmdbId: 100, season: 0, episodes: [2, 2] },
      { tmdbId: 200, season: 1, episodes: [9, 9] },
    ]
    if (mode === "cached") {
      for (const { tmdbId, season } of selections) {
        await cache(
          t,
          `tv:${tmdbId}:season:${season}:v1`,
          normalizeSeasonEpisodes(SEASON)
        )
      }
    } else {
      mockTmdb({
        "/tv/100/season/1": SEASON,
        "/tv/100/season/0": SEASON,
        "/tv/200/season/1": SEASON,
      })
    }
    expect(
      await t.action(api.stats.get, { movieIds: [], tvSeasons: selections })
    ).toEqual({
      ...ZERO_TOTALS,
      episodeMinutes: 183,
      episodesWithRuntime: 4,
    })
    expect(fetchMock).toHaveBeenCalledTimes(mode === "cached" ? 0 : 3)
  }
)

test.each(MODES)(
  "deduplicates %s movies and counts only finite, positive runtimes",
  async (mode) => {
    const t = setup()
    const runtimes = [
      120,
      80.5,
      null,
      0,
      undefined,
      -5,
      NaN,
      Infinity,
      -Infinity,
      "90",
    ]
    const responses: Record<string, Record<string, unknown>> = {}
    for (const [index, runtime] of runtimes.entries()) {
      const id = index + 1
      const data = runtime === undefined ? {} : { runtime }
      if (mode === "cached") {
        await cache(
          t,
          `details:movie:${id}:v2`,
          normalizeDetails(data, {}, "movie")
        )
      } else {
        responses[`/movie/${id}`] = data
        responses[`/movie/${id}/images`] = {}
      }
    }
    if (mode === "uncached") mockTmdb(responses)
    expect(
      await t.action(api.stats.get, {
        movieIds: [...runtimes.map((_, index) => index + 1), 1, 2, 2],
        tvSeasons: [],
      })
    ).toEqual({ ...ZERO_TOTALS, movieMinutes: 200.5, moviesWithRuntime: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(
      mode === "cached" ? 0 : runtimes.length * 2
    )
  }
)

test.each([
  { name: "no media", tvSeasons: [] },
  {
    name: "no episodes",
    tvSeasons: [{ tmdbId: 100, season: 0, episodes: [] }],
  },
])(
  "empty selections return zero without fetching or writing ($name)",
  async ({ tvSeasons }) => {
    const t = setup()
    expect(await t.action(api.stats.get, { movieIds: [], tvSeasons })).toEqual(
      ZERO_TOTALS
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await t.run((ctx) => ctx.db.query("tmdbCache").take(1))).toEqual([])
  }
)

test("authentication is required even for empty input", async () => {
  const t = convexTest(schema, modules)
  for (const args of [
    { movieIds: [], tvSeasons: [] },
    { movieIds: [1], tvSeasons: [{ tmdbId: 100, season: 1, episodes: [2] }] },
  ]) {
    await expect(t.action(api.stats.get, args)).rejects.toThrow("Not signed in")
  }
  expect(fetchMock).not.toHaveBeenCalled()
})

const invalidIdentifiers = ["movie", "tv", "season", "episode"].flatMap(
  (field) =>
    [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]
      .filter((value) => field !== "season" || value !== 0)
      .map((value) => ({ field, value }))
)

test.each(invalidIdentifiers)(
  "rejects invalid $field identifier $value",
  async ({ field, value }) => {
    const t = setup()
    const args = {
      movieIds: [1],
      tvSeasons: [{ tmdbId: 100, season: 1, episodes: [1] }],
    }
    if (field === "movie") args.movieIds[0] = value
    if (field === "tv") args.tvSeasons[0].tmdbId = value
    if (field === "season") args.tvSeasons[0].season = value
    if (field === "episode") args.tvSeasons[0].episodes[0] = value
    await expect(t.action(api.stats.get, args)).rejects.toThrow(
      "must be a safe integer"
    )
    expect(fetchMock).not.toHaveBeenCalled()
  }
)

test("requires episode arrays and rejects client-provided user IDs", async () => {
  const t = setup()
  const invalidArgs = [
    { movieIds: [], tvSeasons: [{ tmdbId: 100, season: 1 }] },
    { movieIds: [], tvSeasons: [{ tmdbId: 100, season: 1, episodes: ["1"] }] },
    { movieIds: [], tvSeasons: [], userId: "another-user" },
  ]
  for (const args of invalidArgs) {
    // Deliberately bypass TypeScript to exercise the public Convex validators.
    await expect(
      t.action(
        api.stats.get,
        args as unknown as FunctionArgs<typeof api.stats.get>
      )
    ).rejects.toThrow()
  }
  expect(fetchMock).not.toHaveBeenCalled()
})

test("validates IDs and episode numbers even beyond the caps", async () => {
  const t = setup()
  const movieIds = Array.from({ length: 300 }, (_, index) => index + 1)
  const tvSeasons = movieIds.map((season) => ({
    tmdbId: 100,
    season,
    episodes: [1],
  }))
  await expect(
    t.action(api.stats.get, { movieIds: [...movieIds, -1], tvSeasons: [] })
  ).rejects.toThrow("Movie ID")
  await expect(
    t.action(api.stats.get, {
      movieIds: [],
      tvSeasons: [...tvSeasons, { tmdbId: 100, season: 301, episodes: [0] }],
    })
  ).rejects.toThrow("Episode number")
  expect(fetchMock).not.toHaveBeenCalled()
})

test("writes full shared payloads and preserves them across callers and selections", async () => {
  const t = setup()
  const movie = {
    runtime: 123,
    overview: "Movie overview",
    tagline: "A tagline",
    genres: [{ name: "Drama" }],
    backdrop_path: "/backdrop.jpg",
    release_date: "2020-01-01",
    vote_average: 8.2,
    status: "Released",
  }
  const images = { logos: [{ iso_639_1: "en", file_path: "/logo.png" }] }
  mockTmdb({
    "/movie/1": movie,
    "/movie/1/images": images,
    "/tv/100/season/1": SEASON,
  })
  await t.action(api.stats.get, {
    movieIds: [1],
    tvSeasons: [{ tmdbId: 100, season: 1, episodes: [2] }],
  })
  const keys = ["details:movie:1:v2", "tv:100:season:1:v1"]
  const before = await t.query(internal.tmdb_cache.getBatch, { keys })
  expect(before).toEqual([
    { payload: normalizeDetails(movie, images, "movie"), fetchedAt: NOW },
    { payload: normalizeSeasonEpisodes(SEASON), fetchedAt: NOW },
  ])
  const otherUser = t.withIdentity({
    ...IDENTITY,
    tokenIdentifier: "https://qa.example.com|other-user",
    subject: "other-user",
  })
  expect(
    await otherUser.action(api.tmdb.details, { mediaType: "movie", tmdbId: 1 })
  ).toEqual(before[0].payload)
  const fullSeason = await otherUser.action(api.tmdb.tvSeason, {
    tmdbId: 100,
    season: 1,
  })
  expect(fullSeason).toEqual(before[1].payload)
  expect(fullSeason.episodes).toHaveLength(SEASON.episodes.length)
  expect(fullSeason.episodes[1]).toMatchObject({
    episode: 2,
    name: "Second episode",
    overview: "Episode overview",
    airDate: "2020-01-08",
    stillPath: "/still.jpg",
  })
  expect(
    await otherUser.action(api.stats.get, {
      movieIds: [1],
      tvSeasons: [{ tmdbId: 100, season: 1, episodes: [9] }],
    })
  ).toEqual({
    movieMinutes: 123,
    moviesWithRuntime: 1,
    episodeMinutes: 90,
    episodesWithRuntime: 1,
    limited: false,
  })
  expect(await t.query(internal.tmdb_cache.getBatch, { keys })).toEqual(before)
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test("retains the six-hour movie and 24-hour season TTL boundaries", async () => {
  const t = setup()
  const movie = normalizeDetails({ runtime: 100 }, {}, "movie")
  const season = normalizeSeasonEpisodes({
    episodes: [{ episode_number: 1, runtime: 25 }],
  })
  await cache(t, "details:movie:1:v2", movie, NOW - 6 * HOUR + 1)
  await cache(t, "details:movie:2:v2", movie, NOW - 6 * HOUR)
  await cache(t, "tv:100:season:1:v1", season, NOW - 24 * HOUR + 1)
  await cache(t, "tv:100:season:2:v1", season, NOW - 24 * HOUR)
  mockTmdb({
    "/movie/2": { runtime: 120 },
    "/movie/2/images": {},
    "/tv/100/season/2": { episodes: [{ episode_number: 1, runtime: 50 }] },
  })
  expect(
    await t.action(api.stats.get, {
      movieIds: [1, 2],
      tvSeasons: [1, 2].map((season) => ({
        tmdbId: 100,
        season,
        episodes: [1],
      })),
    })
  ).toEqual({
    movieMinutes: 220,
    moviesWithRuntime: 2,
    episodeMinutes: 75,
    episodesWithRuntime: 2,
    limited: false,
  })
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test("partial TMDB failures retain successful totals without overwriting failed cache entries", async () => {
  const t = setup()
  await cache(
    t,
    "details:movie:1:v2",
    normalizeDetails({ runtime: 80 }, {}, "movie")
  )
  await cache(
    t,
    "details:movie:2:v2",
    normalizeDetails({ runtime: 200 }, {}, "movie"),
    NOW - 6 * HOUR
  )
  await cache(t, "tv:100:season:1:v1", normalizeSeasonEpisodes(SEASON))
  await cache(
    t,
    "tv:100:season:2:v1",
    normalizeSeasonEpisodes(SEASON),
    NOW - 24 * HOUR
  )
  const failedKeys = [
    "details:movie:2:v2",
    "details:movie:4:v2",
    "tv:100:season:2:v1",
    "tv:100:season:4:v1",
  ]
  const before = await t.query(internal.tmdb_cache.getBatch, {
    keys: failedKeys,
  })
  mockTmdb({
    "/movie/2": new Response(null, { status: 503 }),
    "/movie/2/images": {},
    "/movie/3": { runtime: 120 },
    "/movie/3/images": {},
    "/movie/4": { runtime: 150 },
    "/movie/4/images": new Error("Image request failed"),
    "/tv/100/season/2": new Response("not JSON", { status: 200 }),
    "/tv/100/season/3": SEASON,
    "/tv/100/season/4": new Error("Network failure"),
  })
  expect(
    await t.action(api.stats.get, {
      movieIds: [1, 2, 3, 4],
      tvSeasons: [1, 2, 3, 4].map((season) => ({
        tmdbId: 100,
        season,
        episodes: [season === 1 ? 2 : 1],
      })),
    })
  ).toEqual({
    movieMinutes: 350,
    moviesWithRuntime: 3,
    episodeMinutes: 69,
    episodesWithRuntime: 2,
    limited: false,
  })
  expect(
    await t.query(internal.tmdb_cache.getBatch, { keys: failedKeys })
  ).toEqual(before)
  const successful = await t.query(internal.tmdb_cache.getBatch, {
    keys: ["details:movie:3:v2", "tv:100:season:3:v1"],
  })
  expect(successful.map((entry) => entry.payload)).toEqual([
    normalizeDetails({ runtime: 120 }, {}, "movie"),
    normalizeSeasonEpisodes(SEASON),
  ])
  expect(fetchMock).toHaveBeenCalledTimes(9)
})

test.each([
  { movieCount: 300, seasonCount: 0, limited: false },
  { movieCount: 301, seasonCount: 0, limited: true },
  { movieCount: 0, seasonCount: 300, limited: false },
  { movieCount: 0, seasonCount: 301, limited: true },
  { movieCount: 301, seasonCount: 301, limited: true },
])(
  "caps unique inputs after merging: $movieCount movies, $seasonCount seasons",
  async ({ movieCount, seasonCount, limited }) => {
    const t = setup()
    const movieIds = Array.from({ length: movieCount }, (_, index) => index + 1)
    const tvSeasons = Array.from({ length: seasonCount }, (_, season) => ({
      tmdbId: 100,
      season,
      episodes: [1],
    }))
    const moviePayload = normalizeDetails({ runtime: 1 }, {}, "movie")
    const seasonPayload = normalizeSeasonEpisodes({
      episodes: [
        { episode_number: 1, runtime: 1 },
        { episode_number: 2, runtime: 2 },
      ],
    })
    await t.mutation(internal.tmdb_cache.putBatch, {
      entries: [
        ...movieIds.map((id) => ({
          key: `details:movie:${id}:v2`,
          payload: moviePayload,
          fetchedAt: NOW,
        })),
        ...tvSeasons.map(({ season }) => ({
          key: `tv:100:season:${season}:v1`,
          payload: seasonPayload,
          fetchedAt: NOW,
        })),
      ],
    })
    const hasSeasons = seasonCount > 0
    expect(
      await t.action(api.stats.get, {
        refreshMissing: true,
        // Duplicates before the unique entries must not use up the 300 slots.
        movieIds: [
          ...(movieCount > 0 ? Array<number>(301).fill(1) : []),
          ...movieIds,
        ],
        tvSeasons: [
          ...(hasSeasons ? Array(301).fill(tvSeasons[0]) : []),
          ...tvSeasons,
          // This selection must be merged even though its entry is past the cap.
          ...(hasSeasons ? [{ tmdbId: 100, season: 0, episodes: [2, 2] }] : []),
        ],
      })
    ).toEqual({
      movieMinutes: Math.min(movieCount, 300),
      moviesWithRuntime: Math.min(movieCount, 300),
      episodeMinutes: Math.min(seasonCount, 300) + (hasSeasons ? 2 : 0),
      episodesWithRuntime: Math.min(seasonCount, 300) + (hasSeasons ? 1 : 0),
      limited,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  }
)

test("uncached requests retain six-item chunks", async () => {
  const t = setup()
  const active = { movie: 0, tv: 0 }
  const peak = { movie: 0, tv: 0 }
  fetchMock.mockImplementation(async (input) => {
    const type = new URL(String(input)).pathname.includes("/movie/")
      ? "movie"
      : "tv"
    active[type] += 1
    peak[type] = Math.max(peak[type], active[type])
    await Promise.resolve()
    active[type] -= 1
    return jsonResponse(
      type === "movie"
        ? { runtime: 1 }
        : {
            episodes: [{ episode_number: 1, runtime: 1 }],
          }
    )
  })
  const ids = Array.from({ length: 7 }, (_, index) => index + 1)
  expect(
    await t.action(api.stats.get, {
      movieIds: ids,
      tvSeasons: ids.map((season) => ({ tmdbId: 100, season, episodes: [1] })),
    })
  ).toEqual({
    movieMinutes: 7,
    moviesWithRuntime: 7,
    episodeMinutes: 7,
    episodesWithRuntime: 7,
    limited: false,
  })
  // Each of the six movie items fetches details and images in parallel.
  expect(peak).toEqual({ movie: 12, tv: 6 })
  expect(fetchMock).toHaveBeenCalledTimes(21)
})

test("refreshMissing retries only incomplete selections and preserves full shared payloads", async () => {
  const t = setup()
  const artwork = { logos: [{ iso_639_1: "en", file_path: "/logo.png" }] }
  await cache(
    t,
    "details:movie:1:v2",
    normalizeDetails({ runtime: null, overview: "Old" }, artwork, "movie")
  )
  await cache(
    t,
    "details:movie:2:v2",
    normalizeDetails({ runtime: 120, overview: "Complete" }, artwork, "movie")
  )
  await cache(
    t,
    "tv:100:season:1:v1",
    normalizeSeasonEpisodes({
      episodes: [
        { episode_number: 1, runtime: 20 },
        { episode_number: 2, runtime: null },
      ],
    })
  )
  // An unselected missing runtime must not make this selection incomplete.
  await cache(
    t,
    "tv:100:season:2:v1",
    normalizeSeasonEpisodes({
      episodes: [
        { episode_number: 1, runtime: 30 },
        { episode_number: 2, runtime: null },
      ],
    })
  )
  const completeKeys = ["details:movie:2:v2", "tv:100:season:2:v1"]
  const completeBefore = await t.query(internal.tmdb_cache.getBatch, {
    keys: completeKeys,
  })
  const request = {
    movieIds: [1, 2],
    tvSeasons: [
      { tmdbId: 100, season: 1, episodes: [1, 2, 3] },
      { tmdbId: 100, season: 2, episodes: [1] },
    ],
  }
  const before = {
    ...ZERO_TOTALS,
    movieMinutes: 120,
    moviesWithRuntime: 1,
    episodeMinutes: 50,
    episodesWithRuntime: 2,
  }
  expect(await t.action(api.stats.get, request)).toEqual(before)
  expect(
    await t.action(api.stats.get, { ...request, refreshMissing: false })
  ).toEqual(before)
  expect(fetchMock).not.toHaveBeenCalled()

  const movie = {
    runtime: 90,
    overview: "Updated full details",
    backdrop_path: "/backdrop.jpg",
  }
  const season = {
    name: "Full season",
    episodes: [
      { episode_number: 1, runtime: 20, name: "One" },
      { episode_number: 2, runtime: 25, name: "Two" },
      { episode_number: 3, runtime: 40, name: "Three" },
      { episode_number: 4, runtime: 50, name: "Not selected" },
    ],
  }
  mockTmdb({
    "/movie/1": movie,
    "/movie/1/images": artwork,
    "/tv/100/season/1": season,
  })
  const expected = {
    ...ZERO_TOTALS,
    movieMinutes: 210,
    moviesWithRuntime: 2,
    episodeMinutes: 115,
    episodesWithRuntime: 4,
  }
  expect(
    await t.action(api.stats.get, { ...request, refreshMissing: true })
  ).toEqual(expected)
  expect(
    await t.query(internal.tmdb_cache.getBatch, { keys: completeKeys })
  ).toEqual(completeBefore)
  expect(
    await t.query(internal.tmdb_cache.getBatch, {
      keys: ["details:movie:1:v2", "tv:100:season:1:v1"],
    })
  ).toEqual([
    { payload: normalizeDetails(movie, artwork, "movie"), fetchedAt: NOW },
    { payload: normalizeSeasonEpisodes(season), fetchedAt: NOW },
  ])
  expect(
    await t.action(api.stats.get, { ...request, refreshMissing: true })
  ).toEqual(expected)
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test("failed refresh retains known runtimes and does not overwrite fresh incomplete entries", async () => {
  const t = setup()
  await cache(
    t,
    "details:movie:1:v2",
    normalizeDetails({ runtime: null }, {}, "movie")
  )
  await cache(
    t,
    "tv:100:season:1:v1",
    normalizeSeasonEpisodes({
      episodes: [
        { episode_number: 1, runtime: 20 },
        { episode_number: 2, runtime: null },
      ],
    })
  )
  const keys = ["details:movie:1:v2", "tv:100:season:1:v1"]
  const before = await t.query(internal.tmdb_cache.getBatch, { keys })
  expect(
    await t.action(api.stats.get, {
      movieIds: [1],
      tvSeasons: [{ tmdbId: 100, season: 1, episodes: [1, 2] }],
      refreshMissing: true,
    })
  ).toEqual({ ...ZERO_TOTALS, episodeMinutes: 20, episodesWithRuntime: 1 })
  expect(await t.query(internal.tmdb_cache.getBatch, { keys })).toEqual(before)
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test.each(["missing", "stale", "incomplete"])(
  "movie image failure still counts runtime without changing %s shared artwork",
  async (mode) => {
    const t = setup()
    const key = "details:movie:1:v2"
    if (mode !== "missing") {
      await cache(
        t,
        key,
        normalizeDetails(
          { runtime: mode === "stale" ? 100 : null, overview: "Keep me" },
          { logos: [{ iso_639_1: "en", file_path: "/keep.png" }] },
          "movie"
        ),
        mode === "stale" ? NOW - 6 * HOUR : NOW
      )
    }
    const before = await t.query(internal.tmdb_cache.getBatch, { keys: [key] })
    mockTmdb({
      "/movie/1": { runtime: 125, overview: "New details" },
      "/movie/1/images": new Error("Images unavailable"),
    })
    expect(
      await t.action(api.stats.get, {
        movieIds: [1],
        tvSeasons: [],
        refreshMissing: true,
      })
    ).toEqual({ ...ZERO_TOTALS, movieMinutes: 125, moviesWithRuntime: 1 })
    expect(
      await t.query(internal.tmdb_cache.getBatch, { keys: [key] })
    ).toEqual(before)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  }
)

test("empty seasons cannot consume the cap or hide a nonempty selection", async () => {
  const t = setup()
  await cache(
    t,
    "tv:100:season:300:v1",
    normalizeSeasonEpisodes({ episodes: [{ episode_number: 1, runtime: 20 }] })
  )
  expect(
    await t.action(api.stats.get, {
      movieIds: [],
      tvSeasons: [
        ...Array.from({ length: 300 }, (_, season) => ({
          tmdbId: 100,
          season,
          episodes: [],
        })),
        { tmdbId: 100, season: 300, episodes: [1] },
      ],
      refreshMissing: true,
    })
  ).toEqual({ ...ZERO_TOTALS, episodeMinutes: 20, episodesWithRuntime: 1 })
  expect(fetchMock).not.toHaveBeenCalled()
})
