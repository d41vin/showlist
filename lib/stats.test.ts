import { describe, expect, test } from "vitest"

import {
  buildRuntimeRequest,
  csvField,
  formatWatchTime,
  getActivityYears,
  getDistinctEpisodeWatches,
  getLibraryCounts,
  getMonthlyActivity,
  getRuntimeCoverage,
  getTopShows,
  type EpisodeWatch,
} from "./stats"

const movie = {
  tmdbId: 1,
  mediaType: "movie" as const,
  title: "Movie",
  watched: true,
  watchedAt: new Date(2026, 0, 2, 12).getTime(),
}
const show = {
  tmdbId: 1,
  mediaType: "tv" as const,
  title: "Show",
  watched: true,
}
const watch: EpisodeWatch = {
  tmdbId: 1,
  season: 1,
  episode: 1,
  watchedAt: new Date(2026, 0, 2, 12).getTime(),
}

describe("runtime request", () => {
  test("includes only watched movies and exact episodes, with stable ordering", () => {
    const items = [
      movie,
      show,
      { ...movie, tmdbId: 9 },
      { ...movie, tmdbId: 2, watched: false },
    ]
    const watches = [
      watch,
      { ...watch, episode: 3 },
      { ...watch, season: 0 },
      { ...watch, tmdbId: 2 },
    ]
    const request = buildRuntimeRequest(items, watches)
    expect(request).toEqual({
      movieIds: [1, 9],
      tvSeasons: [
        { tmdbId: 1, season: 0, episodes: [1] },
        { tmdbId: 1, season: 1, episodes: [1, 3] },
        { tmdbId: 2, season: 1, episodes: [1] },
      ],
    })
    expect(
      buildRuntimeRequest([...items].reverse(), [...watches].reverse())
    ).toEqual(request)
    expect(buildRuntimeRequest([movie, movie], [watch, watch])).toEqual({
      movieIds: [1],
      tvSeasons: [{ tmdbId: 1, season: 1, episodes: [1] }],
    })
  })

  test("changes the request when an episode in the same season changes", () => {
    expect(buildRuntimeRequest([], [watch])).not.toEqual(
      buildRuntimeRequest([], [watch, { ...watch, episode: 2 }])
    )
    expect(buildRuntimeRequest([], [])).toEqual({ movieIds: [], tvSeasons: [] })
  })
})

describe("logging activity", () => {
  test("groups by local month and counts each active calendar day once", () => {
    const result = getMonthlyActivity(
      [
        movie,
        { ...movie, tmdbId: 2, watchedAt: new Date(2026, 1, 1, 0).getTime() },
        show,
      ],
      [watch, { ...watch, episode: 2 }],
      2026
    )
    expect(result.months).toHaveLength(12)
    expect(result.months[0]).toEqual({ month: "Jan", movies: 1, episodes: 2 })
    expect(result.months[1]).toEqual({ month: "Feb", movies: 1, episodes: 0 })
    expect(result).toMatchObject({
      movies: 2,
      episodes: 2,
      activeDays: 2,
      undatedMovies: 0,
    })
  })

  test("excludes other years, unwatched movies, TV completion flags and undated movies", () => {
    const items = [
      movie,
      { ...movie, tmdbId: 2, watchedAt: undefined },
      { ...movie, tmdbId: 3, watched: false },
      { ...show, watchedAt: movie.watchedAt },
    ]
    const result = getMonthlyActivity(
      items,
      [{ ...watch, watchedAt: new Date(2025, 11, 31, 23, 59).getTime() }],
      2026
    )
    expect(result).toMatchObject({
      movies: 1,
      episodes: 0,
      activeDays: 1,
      undatedMovies: 1,
    })
    expect(getMonthlyActivity(items, [], 2024).movies).toBe(0)
  })

  test("includes leap day and separates identical day numbers in different months", () => {
    const watches = [
      { ...watch, watchedAt: new Date(2024, 1, 29, 23, 59).getTime() },
      { ...watch, episode: 2, watchedAt: new Date(2024, 2, 29, 0).getTime() },
    ]
    expect(getMonthlyActivity([], watches, 2024)).toMatchObject({
      episodes: 2,
      activeDays: 2,
    })
  })

  test("offers dated years in descending order plus the current year", () => {
    expect(
      getActivityYears(
        [
          movie,
          {
            ...movie,
            watched: false,
            watchedAt: new Date(2020, 0, 1).getTime(),
          },
        ],
        [{ ...watch, watchedAt: new Date(2024, 0, 1).getTime() }],
        2027
      )
    ).toEqual([2027, 2026, 2024])
    expect(getActivityYears([], [], 2026)).toEqual([2026])
    expect(getMonthlyActivity([], [], 2026)).toMatchObject({
      movies: 0,
      episodes: 0,
      activeDays: 0,
    })
  })
})

describe("top shows", () => {
  test("counts distinct episodes, keeps movies separate and handles missing titles", () => {
    const result = getTopShows(
      [movie, show],
      [watch, watch, { ...watch, season: 2 }, { ...watch, tmdbId: 2 }]
    )
    expect(result).toEqual([
      { tmdbId: 1, title: "Show", episodes: 2 },
      { tmdbId: 2, title: "Show #2", episodes: 1 },
    ])
  })

  test("limits to five shows, ordered by count then title", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      ...show,
      tmdbId: i + 1,
      title: `Show ${i + 1}`,
    }))
    const watches = items.map((item) => ({ ...watch, tmdbId: item.tmdbId }))
    const result = getTopShows(items, [
      ...watches,
      { ...watch, tmdbId: 7, episode: 2 },
    ])
    expect(result.map((entry) => entry.tmdbId)).toEqual([7, 1, 2, 3, 4])
    expect(getTopShows([], [])).toEqual([])
  })
})

test.each([
  [0, "0m"],
  [1, "1m"],
  [45, "45m"],
  [60, "1h"],
  [91, "1h 31m"],
  [1440, "1d"],
  [1501, "1d 1h 1m"],
])("formats %s minutes as %s", (minutes, expected) => {
  expect(formatWatchTime(minutes as number)).toBe(expected)
})

test("CSV escaping preserves punctuation and neutralizes spreadsheet formulas", () => {
  expect(csvField('Title, "Part 2"')).toBe('"Title, ""Part 2"""')
  expect(csvField("two\nlines")).toBe('"two\nlines"')
  expect(csvField("=1+1")).toBe("'=1+1")
  expect(csvField("  +1+1")).toBe("'  +1+1")
  expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)")
  expect(csvField(42)).toBe("42")
  expect(csvField(false)).toBe("false")
})

describe("legacy duplicate stats", () => {
  test("library counts distinct media and episode keys, unions flags and resolves sentiment", () => {
    const item = {
      ...movie,
      inWatchlist: false,
      updatedAt: 1,
      sentiment: "liked" as const,
    }
    const items = [
      item,
      {
        ...item,
        watched: false,
        inWatchlist: true,
        updatedAt: 2,
        sentiment: "disliked" as const,
      },
      {
        ...show,
        inWatchlist: false,
        watched: false,
        watching: true,
        updatedAt: 1,
      },
    ]
    const watches = [
      watch,
      watch,
      { ...watch, season: 0 },
      { ...watch, tmdbId: 2 },
    ]
    const expected = {
      titles: 2,
      movies: 1,
      shows: 1,
      episodes: 3,
      watchlist: 1,
      watching: 1,
      watched: 1,
      liked: 0,
      disliked: 1,
    }
    expect(getLibraryCounts(items, watches)).toEqual(expected)
    expect(
      getLibraryCounts([...items].reverse(), [...watches].reverse())
    ).toEqual(expected)
    expect(getLibraryCounts([], [])).toEqual({
      titles: 0,
      movies: 0,
      shows: 0,
      episodes: 0,
      watchlist: 0,
      watching: 0,
      watched: 0,
      liked: 0,
      disliked: 0,
    })
  })

  test("activity years, monthly chart, totals and top shows agree on distinct logs", () => {
    const older = new Date(2025, 5, 10, 12).getTime()
    const items = [
      movie,
      { ...movie, watchedAt: undefined },
      { ...movie, watchedAt: older },
      show,
    ]
    const watches = [
      watch,
      { ...watch, watchedAt: older },
      { ...watch, season: 0 },
    ]
    const before = structuredClone({ items, watches })
    for (const [inputItems, inputWatches] of [
      [items, watches],
      [[...items].reverse(), [...watches].reverse()],
    ] as const) {
      expect(getActivityYears(inputItems, inputWatches, 2027)).toEqual([
        2027, 2026, 2025,
      ])
      expect(getMonthlyActivity(inputItems, inputWatches, 2025)).toMatchObject({
        movies: 1,
        episodes: 1,
        activeDays: 1,
        undatedMovies: 0,
      })
      expect(getMonthlyActivity(inputItems, inputWatches, 2026)).toMatchObject({
        movies: 0,
        episodes: 1,
        activeDays: 1,
        undatedMovies: 0,
      })
      expect(buildRuntimeRequest(inputItems, inputWatches)).toEqual({
        movieIds: [1],
        tvSeasons: [
          { tmdbId: 1, season: 0, episodes: [1] },
          { tmdbId: 1, season: 1, episodes: [1] },
        ],
      })
      expect(getTopShows(inputItems, inputWatches)).toEqual([
        { tmdbId: 1, title: "Show", episodes: 2 },
      ])
      expect(
        getDistinctEpisodeWatches(inputWatches).find(
          (entry) => entry.season === 1
        )?.watchedAt
      ).toBe(older)
    }
    expect({ items, watches }).toEqual(before)
    expect(
      getActivityYears([movie, { ...movie, watchedAt: older }], [], 2027)
    ).toEqual([2027, 2025])
  })

  test("undated duplicate movies count once and invalid dates never become year options", () => {
    const undated = { ...movie, watchedAt: undefined }
    const invalid = { ...movie, tmdbId: 2, watchedAt: Infinity }
    const invalidWatch = { ...watch, watchedAt: NaN }
    expect(
      getMonthlyActivity(
        [undated, undated, invalid, invalid],
        [invalidWatch],
        2026
      )
    ).toMatchObject({ movies: 0, episodes: 0, undatedMovies: 2, activeDays: 0 })
    expect(getActivityYears([invalid], [invalidWatch], 2026)).toEqual([2026])
    expect(
      getMonthlyActivity(
        [invalid, { ...invalid, watchedAt: movie.watchedAt }],
        [invalidWatch, watch],
        2026
      )
    ).toMatchObject({ movies: 1, episodes: 1, undatedMovies: 0 })
  })
})

describe("runtime retry coverage", () => {
  test("complete and empty selections have no retryable gaps", () => {
    expect(
      getRuntimeCoverage(buildRuntimeRequest([], []), {
        moviesWithRuntime: 0,
        episodesWithRuntime: 0,
      })
    ).toEqual({
      movieCount: 0,
      episodeCount: 0,
      missing: 0,
      retryableMissing: 0,
      capped: 0,
    })
    expect(
      getRuntimeCoverage(buildRuntimeRequest([movie, movie], [watch, watch]), {
        moviesWithRuntime: 1,
        episodesWithRuntime: 1,
      })
    ).toEqual({
      movieCount: 1,
      episodeCount: 1,
      missing: 0,
      retryableMissing: 0,
      capped: 0,
    })
  })

  test("separates missing runtimes from cap-only gaps without counting seasons as episodes", () => {
    const items = Array.from({ length: 301 }, (_, i) => ({
      ...movie,
      tmdbId: i + 1,
    }))
    const watches = Array.from({ length: 301 }, (_, season) => ({
      ...watch,
      season,
    }))
    watches.push({ ...watch, season: 300, episode: 2 })
    const request = buildRuntimeRequest(items, watches)
    expect(
      getRuntimeCoverage(request, {
        moviesWithRuntime: 300,
        episodesWithRuntime: 300,
      })
    ).toEqual({
      movieCount: 301,
      episodeCount: 302,
      missing: 3,
      retryableMissing: 0,
      capped: 3,
    })
    expect(
      getRuntimeCoverage(request, {
        moviesWithRuntime: 299,
        episodesWithRuntime: 298,
      })
    ).toEqual({
      movieCount: 301,
      episodeCount: 302,
      missing: 6,
      retryableMissing: 3,
      capped: 3,
    })
    expect(
      getRuntimeCoverage(buildRuntimeRequest([movie], [watch]), {
        moviesWithRuntime: 0,
        episodesWithRuntime: 0,
      })
    ).toEqual({
      movieCount: 1,
      episodeCount: 1,
      missing: 2,
      retryableMissing: 2,
      capped: 0,
    })
  })
})
