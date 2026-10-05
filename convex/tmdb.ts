import { v, type Infer } from "convex/values"

import { internal } from "./_generated/api"
import { action } from "./_generated/server"

const TMDB_BASE = "https://api.themoviedb.org/3"

const mediaTypeValidator = v.union(v.literal("movie"), v.literal("tv"))

// A minimal TMDB snapshot — the shape cards render from and mutations store.
export const searchResultValidator = v.object({
  tmdbId: v.number(),
  mediaType: mediaTypeValidator,
  title: v.string(),
  posterPath: v.union(v.string(), v.null()),
  year: v.union(v.string(), v.null()),
})

// Normalized TMDB shapes below are also the tmdbCache payloads — the cached
// object IS the function return value.

export const episodeRefValidator = v.object({
  season: v.number(),
  episode: v.number(),
  name: v.union(v.string(), v.null()),
  airDate: v.union(v.string(), v.null()),
  stillPath: v.union(v.string(), v.null()),
})

export const seasonSummaryValidator = v.object({
  season: v.number(),
  name: v.string(),
  episodeCount: v.number(),
  airDate: v.union(v.string(), v.null()),
  posterPath: v.union(v.string(), v.null()),
})

export const seasonEpisodesValidator = v.object({
  name: v.union(v.string(), v.null()),
  airDate: v.union(v.string(), v.null()),
  episodes: v.array(
    v.object({
      episode: v.number(),
      name: v.union(v.string(), v.null()),
      overview: v.union(v.string(), v.null()),
      airDate: v.union(v.string(), v.null()),
      runtime: v.union(v.number(), v.null()),
      stillPath: v.union(v.string(), v.null()),
    })
  ),
})

// Cached details stay useful for hours; TMDB metadata changes rarely and the
// schedule re-reads the same entries with its own freshness rule.
const DETAILS_TTL_MS = 12 * 60 * 60 * 1000
const SEASON_TTL_MS = 24 * 60 * 60 * 1000
const RECOMMENDATIONS_TTL_MS = 24 * 60 * 60 * 1000
const GENRES_TTL_MS = 7 * 24 * 60 * 60 * 1000
const WATCH_PROVIDERS_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Watch-provider availability region for the Discover "Only on" section.
const WATCH_REGION = "US"

// Streaming providers available in WATCH_REGION (movie list — ids are the
// same across movie/tv), for the "Only on" rail.
const watchProviderValidator = v.object({
  id: v.number(),
  name: v.string(),
  logoPath: v.union(v.string(), v.null()),
})

export const watchProviders = action({
  args: {},
  returns: v.array(watchProviderValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const cacheKey = `watch-providers:${WATCH_REGION}:v1`
    const [cached] = (await ctx.runQuery(internal.tmdb_cache.getBatch, {
      keys: [cacheKey],
    })) as CacheEntry[]
    if (
      cached?.payload != null &&
      Date.now() - cached.fetchedAt < WATCH_PROVIDERS_TTL_MS
    ) {
      return cached.payload as WatchProviderPayload[]
    }

    const data = await tmdbFetch(`/watch/providers/movie`, {
      language: "en-US",
      watch_region: WATCH_REGION,
    })
    const raw = Array.isArray(data.results) ? data.results : []
    // keep a curated size: TMDB returns 200+ providers incl. niche VOD
    const list = raw
      .map((r: Record<string, unknown>) => ({
        id: typeof r.provider_id === "number" ? r.provider_id : -1,
        name: typeof r.provider_name === "string" ? r.provider_name : "",
        logoPath:
          typeof r.logo_path === "string" ? r.logo_path : null,
      }))
      .filter(
        (r) => r.id >= 0 && r.name !== "" && r.logoPath !== null
      )
      .slice(0, 40)

    await ctx.runMutation(internal.tmdb_cache.putBatch, {
      entries: [{ key: cacheKey, payload: list, fetchedAt: Date.now() }],
    })
    return list
  },
})

const detailsValidator = v.object({
  overview: v.union(v.string(), v.null()),
  tagline: v.union(v.string(), v.null()),
  genres: v.array(v.string()),
  runtime: v.union(v.number(), v.null()),
  numberOfSeasons: v.union(v.number(), v.null()),
  numberOfEpisodes: v.union(v.number(), v.null()),
  voteAverage: v.union(v.number(), v.null()),
  releaseDate: v.union(v.string(), v.null()),
  backdropPath: v.union(v.string(), v.null()),
  logoPath: v.union(v.string(), v.null()),
  status: v.union(v.string(), v.null()),
  seasons: v.array(seasonSummaryValidator),
  nextEpisode: v.union(episodeRefValidator, v.null()),
  lastEpisode: v.union(episodeRefValidator, v.null()),
})

type DetailsPayload = Infer<typeof detailsValidator>
type SeasonEpisodesPayload = Infer<typeof seasonEpisodesValidator>
type SearchResultPayload = Infer<typeof searchResultValidator>
type WatchProviderPayload = Infer<typeof watchProviderValidator>
// Shape of one entry from tmdb_cache.getBatch; the annotation breaks the
// TS circularity that runQuery results would otherwise create here.
type CacheEntry = { payload: unknown; fetchedAt: number }

// Supports both TMDB v4 read access tokens (JWT) and v3 API keys.
// Exported for schedule.ts, which re-reads the same cache entries and must
// normalize identically.
export async function tmdbFetch(path: string, params: Record<string, string>) {
  const key = process.env.TMDB_API_KEY
  if (!key) {
    throw new Error("TMDB_API_KEY is not set on the Convex deployment")
  }
  const url = new URL(`${TMDB_BASE}${path}`)
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value)
  }
  const headers: Record<string, string> = { accept: "application/json" }
  if (key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`
  } else {
    url.searchParams.set("api_key", key)
  }
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`TMDB request failed with status ${response.status}`)
  }
  return (await response.json()) as Record<string, unknown>
}

// Raw TMDB show/season responses → the exact cached payload shapes above.
// Shared by tmdb.details / tmdb.tvSeason and the schedule action.
export function normalizeDetails(
  data: Record<string, unknown>,
  imagesData: Record<string, unknown>,
  mediaType: "movie" | "tv"
): DetailsPayload {
  const genres = Array.isArray(data.genres)
    ? data.genres
        .map((g: Record<string, unknown>) => g.name)
        .filter((name): name is string => typeof name === "string")
    : []
  const logos = Array.isArray(imagesData.logos) ? imagesData.logos : []
  const logo =
    logos.find((l: Record<string, unknown>) => l.iso_639_1 === "en") ??
    logos[0] ??
    null
  const logoPath =
    logo && typeof (logo as Record<string, unknown>).file_path === "string"
      ? ((logo as Record<string, unknown>).file_path as string)
      : null

  // Season list + next/last episode only exist on TV; movies get empty
  // defaults so one validator covers both.
  const rawSeasons = Array.isArray(data.seasons) ? data.seasons : []
  const seasons = rawSeasons.map((s: Record<string, unknown>) => ({
    season: typeof s.season_number === "number" ? s.season_number : 0,
    name: typeof s.name === "string" ? s.name : "",
    episodeCount: typeof s.episode_count === "number" ? s.episode_count : 0,
    airDate: typeof s.air_date === "string" ? s.air_date : null,
    posterPath: typeof s.poster_path === "string" ? s.poster_path : null,
  }))

  return {
    overview: typeof data.overview === "string" ? data.overview : null,
    tagline:
      typeof data.tagline === "string" && data.tagline !== ""
        ? data.tagline
        : null,
    genres,
    runtime: typeof data.runtime === "number" ? data.runtime : null,
    numberOfSeasons:
      typeof data.number_of_seasons === "number"
        ? data.number_of_seasons
        : null,
    numberOfEpisodes:
      typeof data.number_of_episodes === "number"
        ? data.number_of_episodes
        : null,
    voteAverage:
      typeof data.vote_average === "number" ? data.vote_average : null,
    backdropPath:
      typeof data.backdrop_path === "string" ? data.backdrop_path : null,
    releaseDate:
      typeof (mediaType === "movie"
        ? data.release_date
        : data.first_air_date) === "string"
        ? String(
            mediaType === "movie" ? data.release_date : data.first_air_date
          )
        : null,
    logoPath,
    status: typeof data.status === "string" ? data.status : null,
    seasons,
    nextEpisode: episodeRef(data.next_episode_to_air),
    lastEpisode: episodeRef(data.last_episode_to_air),
  }
}

export function normalizeSeasonEpisodes(
  data: Record<string, unknown>
): SeasonEpisodesPayload {
  const rawEpisodes = Array.isArray(data.episodes) ? data.episodes : []
  return {
    name: typeof data.name === "string" ? data.name : null,
    airDate: typeof data.air_date === "string" ? data.air_date : null,
    episodes: rawEpisodes.map((e: Record<string, unknown>) => ({
      episode: typeof e.episode_number === "number" ? e.episode_number : 0,
      name: typeof e.name === "string" ? e.name : null,
      overview: typeof e.overview === "string" ? e.overview : null,
      airDate: typeof e.air_date === "string" ? e.air_date : null,
      runtime: typeof e.runtime === "number" ? e.runtime : null,
      stillPath: typeof e.still_path === "string" ? e.still_path : null,
    })),
  }
}

function episodeRef(e: unknown) {
  if (e === null || typeof e !== "object") return null
  const ep = e as Record<string, unknown>
  return {
    season: typeof ep.season_number === "number" ? ep.season_number : 0,
    episode: typeof ep.episode_number === "number" ? ep.episode_number : 0,
    name: typeof ep.name === "string" ? ep.name : null,
    airDate: typeof ep.air_date === "string" ? ep.air_date : null,
    stillPath: typeof ep.still_path === "string" ? ep.still_path : null,
  }
}

function yearOf(date: unknown): string | null {
  return typeof date === "string" && date.length >= 4 ? date.slice(0, 4) : null
}

export const search = action({
  args: { query: v.string(), page: v.optional(v.number()) },
  returns: v.object({
    items: v.array(searchResultValidator),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const query = args.query.trim()
    if (query === "") {
      return { items: [], hasMore: false }
    }
    const page = args.page ?? 1
    const data = await tmdbFetch("/search/multi", {
      query,
      include_adult: "false",
      language: "en-US",
      page: String(page),
    })
    const results = Array.isArray(data.results) ? data.results : []
    const items = results
      // Keep movies/tv only; also drop anything TMDB flags as adult, in case
      // a pornographic title slips past include_adult=false via bad tagging.
      .filter(
        (r: Record<string, unknown>) =>
          (r.media_type === "movie" || r.media_type === "tv") &&
          r.adult !== true
      )
      .map((r: Record<string, unknown>) => ({
        tmdbId: r.id as number,
        mediaType: r.media_type as "movie" | "tv",
        title: String(r.media_type === "movie" ? r.title : r.name),
        posterPath: typeof r.poster_path === "string" ? r.poster_path : null,
        year: yearOf(
          r.media_type === "movie" ? r.release_date : r.first_air_date
        ),
      }))
    const totalPages =
      typeof data.total_pages === "number" ? data.total_pages : page
    return { items, hasMore: page < totalPages }
  },
})

export const details = action({
  args: { mediaType: mediaTypeValidator, tmdbId: v.number() },
  returns: detailsValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const cacheKey = `details:${args.mediaType}:${args.tmdbId}:v2`
    const [cached] = (await ctx.runQuery(internal.tmdb_cache.getBatch, {
      keys: [cacheKey],
    })) as CacheEntry[]
    const cachedPayload = cached?.payload as DetailsPayload | null
    if (
      cachedPayload !== null &&
      cached.payload !== null &&
      Date.now() - cached.fetchedAt < DETAILS_TTL_MS
    ) {
      return cachedPayload
    }

    const [data, imagesData] = await Promise.all([
      tmdbFetch(`/${args.mediaType}/${args.tmdbId}`, { language: "en-US" }),
      tmdbFetch(`/${args.mediaType}/${args.tmdbId}/images`, {
        include_image_language: "en,null",
      }),
    ])
    const payload = normalizeDetails(data, imagesData, args.mediaType)

    await ctx.runMutation(internal.tmdb_cache.putBatch, {
      entries: [{ key: cacheKey, payload, fetchedAt: Date.now() }],
    })
    return payload
  },
})

// One season's episode list for the details drawer's Episodes section.
export const tvSeason = action({
  args: { tmdbId: v.number(), season: v.number() },
  returns: seasonEpisodesValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const cacheKey = `tv:${args.tmdbId}:season:${args.season}:v1`
    const [cached] = (await ctx.runQuery(internal.tmdb_cache.getBatch, {
      keys: [cacheKey],
    })) as CacheEntry[]
    const cachedPayload = cached?.payload as SeasonEpisodesPayload | null
    if (
      cachedPayload !== null &&
      cached.payload !== null &&
      Date.now() - cached.fetchedAt < SEASON_TTL_MS
    ) {
      return cachedPayload
    }

    const data = await tmdbFetch(`/tv/${args.tmdbId}/season/${args.season}`, {
      language: "en-US",
    })
    const payload = normalizeSeasonEpisodes(data)

    await ctx.runMutation(internal.tmdb_cache.putBatch, {
      entries: [{ key: cacheKey, payload, fetchedAt: Date.now() }],
    })
    return payload
  },
})

// Native TMDB recommendations for one title — "More like this" in the
// details drawer. No LLM involved.
export const recommendations = action({
  args: { mediaType: mediaTypeValidator, tmdbId: v.number() },
  returns: v.array(searchResultValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const cacheKey = `recs:${args.mediaType}:${args.tmdbId}:v1`
    const [cached] = (await ctx.runQuery(internal.tmdb_cache.getBatch, {
      keys: [cacheKey],
    })) as CacheEntry[]
    if (
      cached?.payload != null &&
      Date.now() - cached.fetchedAt < RECOMMENDATIONS_TTL_MS
    ) {
      return cached.payload as SearchResultPayload[]
    }

    const data = await tmdbFetch(
      `/${args.mediaType}/${args.tmdbId}/recommendations`,
      { language: "en-US" }
    )
    const results = Array.isArray(data.results) ? data.results : []
    const items = normalizeResults(results, args.mediaType)

    await ctx.runMutation(internal.tmdb_cache.putBatch, {
      entries: [{ key: cacheKey, payload: items, fetchedAt: Date.now() }],
    })
    return items
  },
})

const genreValidator = v.object({ id: v.number(), name: v.string() })

// Genre lists per media type — the Discover browse filter's options.
export const genres = action({
  args: { mediaType: mediaTypeValidator },
  returns: v.array(genreValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const cacheKey = `genres:${args.mediaType}:v1`
    const [cached] = (await ctx.runQuery(internal.tmdb_cache.getBatch, {
      keys: [cacheKey],
    })) as CacheEntry[]
    if (
      cached?.payload != null &&
      Date.now() - cached.fetchedAt < GENRES_TTL_MS
    ) {
      return cached.payload as Infer<typeof genreValidator>[]
    }

    const data = await tmdbFetch(`/genre/${args.mediaType}/list`, {
      language: "en-US",
    })
    const raw = Array.isArray(data.genres) ? data.genres : []
    const list = raw
      .map((g: Record<string, unknown>) => ({
        id: typeof g.id === "number" ? g.id : -1,
        name: typeof g.name === "string" ? g.name : "",
      }))
      .filter((g) => g.id >= 0 && g.name !== "")

    await ctx.runMutation(internal.tmdb_cache.putBatch, {
      entries: [{ key: cacheKey, payload: list, fetchedAt: Date.now() }],
    })
    return list
  },
})

export type DiscoverSort = "popularity" | "rating" | "newest"

// Discover-by-filters for the browse mode: genre + sort, paginated like
// search. Rating and newest sorts get a vote-count floor so obscurities
// don't dominate.
export const discover = action({
  args: {
    mediaType: mediaTypeValidator,
    // At least one of genre / watchProvider must be set.
    genre: v.optional(v.number()),
    watchProvider: v.optional(v.number()),
    sort: v.union(
      v.literal("popularity"),
      v.literal("rating"),
      v.literal("newest")
    ),
    page: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(searchResultValidator),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const sortBy =
      args.sort === "popularity"
        ? "popularity.desc"
        : args.sort === "rating"
          ? "vote_average.desc"
          : args.mediaType === "movie"
            ? "primary_release_date.desc"
            : "first_air_date.desc"
    if (args.genre === undefined && args.watchProvider === undefined) {
      throw new Error("discover requires a genre or watchProvider filter")
    }
    const params: Record<string, string> = {
      language: "en-US",
      sort_by: sortBy,
      include_adult: "false",
      page: String(args.page ?? 1),
    }
    if (args.genre !== undefined) {
      params.with_genres = String(args.genre)
    }
    if (args.watchProvider !== undefined) {
      // Availability is region-dependent; the UI offers a fixed region.
      params.with_watch_providers = String(args.watchProvider)
      params.watch_region = WATCH_REGION
    }
    if (args.sort === "rating") {
      params["vote_count.gte"] = "300"
    } else if (args.sort === "newest") {
      params["vote_count.gte"] = "10"
    }
    const data = await tmdbFetch(`/discover/${args.mediaType}`, params)
    const results = Array.isArray(data.results) ? data.results : []
    const items = normalizeResults(results, args.mediaType)
    const totalPages =
      typeof data.total_pages === "number" ? data.total_pages : (args.page ?? 1)
    return {
      items,
      hasMore: (args.page ?? 1) < Math.min(totalPages, 500),
    }
  },
})

// ---------------------------------------------------------------------------
// Discovery helpers & actions
// ---------------------------------------------------------------------------

/**
 * Shared normaliser: filters adult & non-movie/tv entries, then maps raw TMDB
 * results into the searchResultValidator shape.  `inferredType` is used when
 * the API response does not carry a `media_type` field (i.e. every endpoint
 * except `/trending/all/week`).
 */
function normalizeResults(
  results: Record<string, unknown>[],
  inferredType?: "movie" | "tv"
) {
  return results
    .filter(
      (r) =>
        (inferredType !== undefined
          ? r.media_type === undefined || r.media_type === inferredType
          : r.media_type === "movie" || r.media_type === "tv") &&
        r.adult !== true
    )
    .map((r) => {
      const mediaType =
        (r.media_type as "movie" | "tv" | undefined) ?? inferredType!
      return {
        tmdbId: r.id as number,
        mediaType,
        title: String(mediaType === "movie" ? r.title : r.name),
        posterPath: typeof r.poster_path === "string" ? r.poster_path : null,
        year: yearOf(mediaType === "movie" ? r.release_date : r.first_air_date),
      }
    })
}

export const discoverTrending = action({
  args: {
    mediaType: v.union(v.literal("all"), v.literal("movie"), v.literal("tv")),
  },
  returns: v.array(searchResultValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const data = await tmdbFetch(`/trending/${args.mediaType}/week`, {
      language: "en-US",
    })
    const results = Array.isArray(data.results) ? data.results : []
    // /trending/all/week includes media_type; /trending/movie|tv/week does not.
    const inferredType =
      args.mediaType === "all" ? undefined : (args.mediaType as "movie" | "tv")
    return normalizeResults(results, inferredType)
  },
})

export const discoverPopular = action({
  args: { mediaType: mediaTypeValidator },
  returns: v.array(searchResultValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const data = await tmdbFetch(`/${args.mediaType}/popular`, {
      language: "en-US",
    })
    const results = Array.isArray(data.results) ? data.results : []
    return normalizeResults(results, args.mediaType)
  },
})

export const discoverTopRated = action({
  args: { mediaType: mediaTypeValidator },
  returns: v.array(searchResultValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const data = await tmdbFetch(`/${args.mediaType}/top_rated`, {
      language: "en-US",
    })
    const results = Array.isArray(data.results) ? data.results : []
    return normalizeResults(results, args.mediaType)
  },
})

export const discoverNowPlaying = action({
  args: { mediaType: mediaTypeValidator },
  returns: v.array(searchResultValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const path =
      args.mediaType === "movie" ? "/movie/now_playing" : "/tv/airing_today"
    const data = await tmdbFetch(path, { language: "en-US" })
    const results = Array.isArray(data.results) ? data.results : []
    return normalizeResults(results, args.mediaType)
  },
})
