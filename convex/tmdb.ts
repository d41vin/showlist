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
const VIDEOS_TTL_MS = 24 * 60 * 60 * 1000
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
        logoPath: typeof r.logo_path === "string" ? r.logo_path : null,
      }))
      .filter((r) => r.id >= 0 && r.name !== "" && r.logoPath !== null)
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

const titleValidator = v.object({
  item: searchResultValidator,
  details: detailsValidator,
})

type DetailsPayload = Infer<typeof detailsValidator>
type TitlePayload = Infer<typeof titleValidator>
type SeasonEpisodesPayload = Infer<typeof seasonEpisodesValidator>
type SearchResultPayload = Infer<typeof searchResultValidator>
type WatchProviderPayload = Infer<typeof watchProviderValidator>
// Shape of one entry from tmdb_cache.getBatch; the annotation breaks the
// TS circularity that runQuery results would otherwise create here.
type CacheEntry = { payload: unknown; fetchedAt: number }

class TmdbHttpError extends Error {
  constructor(readonly status: number) {
    super(`TMDB request failed with status ${status}`)
    this.name = "TmdbHttpError"
  }
}

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
    throw new TmdbHttpError(response.status)
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

const searchSortValidator = v.union(
  v.literal("relevance"),
  v.literal("popularity"),
  v.literal("newest"),
  v.literal("rating"),
  v.literal("title")
)
const sortOrderValidator = v.union(v.literal("asc"), v.literal("desc"))

type SearchSort = Infer<typeof searchSortValidator>
type SortOrder = Infer<typeof sortOrderValidator>
type SearchRow = {
  item: SearchResultPayload
  popularity: number
  rating: number
  votes: number
  date: string
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function searchRows(
  data: Record<string, unknown>,
  selected?: MediaType
): SearchRow[] {
  const results = Array.isArray(data.results) ? data.results : []
  const rows: SearchRow[] = []
  for (const raw of results) {
    if (raw === null || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const mediaType = selected ?? r.media_type
    const title = mediaType === "movie" ? r.title : r.name
    if (
      (mediaType !== "movie" && mediaType !== "tv") ||
      r.adult === true ||
      !positiveId(r.id) ||
      typeof title !== "string" ||
      title.trim() === ""
    )
      continue
    const date = dateOf(
      mediaType === "movie" ? r.release_date : r.first_air_date
    )
    rows.push({
      item: {
        tmdbId: r.id,
        mediaType,
        title,
        posterPath: typeof r.poster_path === "string" ? r.poster_path : null,
        year: yearOf(mediaType === "movie" ? r.release_date : r.first_air_date),
      },
      popularity: finiteNumber(r.popularity),
      rating: finiteNumber(r.vote_average),
      votes: finiteNumber(r.vote_count),
      date,
    })
  }
  return rows
}

// Search endpoints cannot sort server-side. A sorted view gathers the first
// few result pages and orders that pool locally, so the first 60 matches are
// genuinely sorted instead of each page being shuffled in isolation.
const SORTED_SEARCH_PAGES = 3

function compareRows(
  a: SearchRow,
  b: SearchRow,
  sort: Exclude<SearchSort, "relevance">,
  order: SortOrder
) {
  const direction = order === "asc" ? 1 : -1
  if (sort === "popularity") {
    return (a.popularity - b.popularity) * direction
  }
  if (sort === "newest") {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date) * direction
  }
  if (sort === "rating") {
    if (a.rating === 0 && b.rating === 0) return 0
    if (a.rating === 0) return 1
    if (b.rating === 0) return -1
    return (a.rating - b.rating) * direction || b.votes - a.votes
  }
  return a.item.title.localeCompare(b.item.title) * direction
}

export const search = action({
  args: {
    query: v.string(),
    page: v.optional(v.number()),
    mediaType: v.optional(mediaTypeValidator),
    sort: v.optional(searchSortValidator),
    order: v.optional(sortOrderValidator),
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
    const query = args.query.trim()
    const page = args.page ?? 1
    if (query.length > 200)
      throw new Error("Search is limited to 200 characters")
    if (!Number.isSafeInteger(page) || page < 1 || page > 500) {
      throw new Error("Invalid search page")
    }
    if (query === "") return { items: [], hasMore: false }
    const sort = args.sort ?? "relevance"
    const order = args.order ?? (sort === "title" ? "asc" : "desc")
    const path = `/search/${args.mediaType ?? "multi"}`
    const params = {
      query,
      include_adult: "false",
      language: "en-US",
    }

    if (sort !== "relevance") {
      const first = await tmdbFetch(path, { ...params, page: "1" })
      const totalPages =
        typeof first.total_pages === "number"
          ? Math.min(Math.max(1, first.total_pages), 500)
          : 1
      const pageCount = Math.min(SORTED_SEARCH_PAGES, totalPages)
      const rest = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, i) =>
          tmdbFetch(path, { ...params, page: String(i + 2) })
        )
      )
      const seen = new Set<string>()
      const rows = [first, ...rest]
        .flatMap((data) => searchRows(data, args.mediaType))
        .filter((row) => {
          const key = `${row.item.mediaType}:${row.item.tmdbId}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .sort(
          (a, b) =>
            compareRows(a, b, sort, order) ||
            b.popularity - a.popularity ||
            a.item.mediaType.localeCompare(b.item.mediaType) ||
            a.item.tmdbId - b.item.tmdbId
        )
      return { items: rows.map((row) => row.item), hasMore: false }
    }

    const data = await tmdbFetch(path, { ...params, page: String(page) })
    const seen = new Set<string>()
    const items = searchRows(data, args.mediaType)
      .filter((row) => {
        const key = `${row.item.mediaType}:${row.item.tmdbId}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((row) => row.item)
    const totalPages =
      typeof data.total_pages === "number"
        ? Math.min(data.total_pages, 500)
        : page
    return { items, hasMore: page < totalPages }
  },
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

// Title snapshots must not change the shared details cache shape.
export const title = action({
  args: { mediaType: mediaTypeValidator, tmdbId: v.number() },
  returns: v.union(titleValidator, v.null()),
  handler: async (ctx, args): Promise<TitlePayload | null> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    if (!Number.isSafeInteger(args.tmdbId) || args.tmdbId <= 0) {
      throw new Error("Invalid TMDB ID")
    }
    const cacheKey = `title:${args.mediaType}:${args.tmdbId}:v1`
    const [cached] = (await ctx.runQuery(internal.tmdb_cache.getBatch, {
      keys: [cacheKey],
    })) as CacheEntry[]
    if (
      cached?.payload != null &&
      Date.now() - cached.fetchedAt < DETAILS_TTL_MS
    ) {
      return cached.payload as TitlePayload
    }

    // Start both requests on a cold open. Only artwork is best-effort; do not
    // wait for it before propagating a metadata failure or a hidden title.
    const metadataPromise = tmdbFetch(`/${args.mediaType}/${args.tmdbId}`, {
      language: "en-US",
    })
    const imagesPromise = tmdbFetch(
      `/${args.mediaType}/${args.tmdbId}/images`,
      { include_image_language: "en,null" }
    ).catch(() => null)
    let data: Record<string, unknown>
    try {
      data = await metadataPromise
    } catch (error) {
      if (error instanceof TmdbHttpError && error.status === 404) return null
      throw error
    }
    if (
      !isRecord(data) ||
      data.id !== args.tmdbId ||
      (data.media_type !== undefined && data.media_type !== args.mediaType) ||
      (data.adult !== undefined && typeof data.adult !== "boolean")
    ) {
      throw new Error("Invalid TMDB title response")
    }
    if (data.adult === true) return null
    const name = args.mediaType === "movie" ? data.title : data.name
    if (
      typeof name !== "string" ||
      name.trim() === "" ||
      // normalizeDetails expects object entries in these optional arrays.
      ![data.genres, data.seasons].every(
        (rows) => rows == null || (Array.isArray(rows) && rows.every(isRecord))
      )
    ) {
      throw new Error("Invalid TMDB title response")
    }

    const imagesData = await imagesPromise
    const imagesComplete =
      isRecord(imagesData) &&
      Array.isArray(imagesData.logos) &&
      imagesData.logos.every(
        (logo) =>
          isRecord(logo) &&
          typeof logo.file_path === "string" &&
          logo.file_path !== ""
      )
    const payload: TitlePayload = {
      item: {
        tmdbId: args.tmdbId,
        mediaType: args.mediaType,
        title: name,
        posterPath:
          typeof data.poster_path === "string" ? data.poster_path : null,
        year: yearOf(
          args.mediaType === "movie" ? data.release_date : data.first_air_date
        ),
      },
      details: normalizeDetails(
        data,
        imagesComplete ? imagesData : {},
        args.mediaType
      ),
    }
    // Partial artwork responses must not replace complete cache entries.
    if (imagesComplete) {
      const fetchedAt = Date.now()
      await ctx.runMutation(internal.tmdb_cache.putBatch, {
        entries: [
          { key: cacheKey, payload, fetchedAt },
          {
            key: `details:${args.mediaType}:${args.tmdbId}:v2`,
            payload: payload.details,
            fetchedAt,
          },
        ],
      })
    }
    return payload
  },
})

const namedEntityValidator = v.object({ id: v.number(), name: v.string() })
const creditedPersonValidator = namedEntityValidator.extend({
  role: v.string(),
})
const titleExtrasValidator = v.object({
  genres: v.array(namedEntityValidator),
  countries: v.array(v.object({ code: v.string(), name: v.string() })),
  companies: v.array(namedEntityValidator),
  alternativeTitles: v.array(v.string()),
  cast: v.array(creditedPersonValidator),
  crew: v.array(creditedPersonValidator),
  backdrops: v.array(v.string()),
})
type TitleExtras = Infer<typeof titleExtrasValidator>

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function namedEntities(value: unknown) {
  const seen = new Set<number>()
  const items: { id: number; name: string }[] = []
  for (const row of records(value)) {
    const name = boundedText(row.name)
    if (!positiveId(row.id) || !name || seen.has(row.id)) continue
    seen.add(row.id)
    items.push({ id: row.id, name })
    if (items.length === 50) break
  }
  return items
}

function creditedPeople(value: unknown, cast: boolean, aggregate: boolean) {
  const rows = records(value)
  // TMDB's order is billing, not popularity or episode count. Stable sorting
  // preserves upstream order for ties and credits with no billing field.
  const billing = (row: Record<string, unknown>) =>
    typeof row.order === "number" &&
    Number.isSafeInteger(row.order) &&
    row.order >= 0
      ? row.order
      : Number.MAX_SAFE_INTEGER
  if (cast) rows.sort((a, b) => billing(a) - billing(b))
  const people = new Map<
    number,
    { id: number; name: string; roles: Set<string> }
  >()
  for (const row of rows) {
    const name = boundedText(row.name)
    if (
      !positiveId(row.id) ||
      !name ||
      (row.adult !== undefined && row.adult !== false)
    )
      continue
    let person = people.get(row.id)
    if (!person) {
      if (people.size === 8192) {
        throw new Error(
          "TMDB extras credits exceed the 8192-person array limit"
        )
      }
      person = { id: row.id, name, roles: new Set() }
      people.set(row.id, person)
    }
    const roleKey = cast ? "character" : "job"
    const roles = aggregate ? records(row[cast ? "roles" : "jobs"]) : [row]
    for (const role of roles) {
      const label = boundedText(role[roleKey], 100)
      if (label && person.roles.size < 10) person.roles.add(label)
    }
  }
  return [...people.values()].map(({ id, name, roles }) => ({
    id,
    name,
    role: [...roles].join(", ").slice(0, 300),
  }))
}

function gallery(value: unknown): string[] {
  const positive = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
  const candidates = records(value).filter((row) => {
    const width = positive(row.width)
    const height = positive(row.height)
    return (
      imagePath(row.file_path) !== null &&
      width >= 780 &&
      height >= 400 &&
      width / height >= 1.3 &&
      width / height <= 2.5
    )
  })
  candidates.sort(
    (a, b) =>
      positive(b.vote_average) - positive(a.vote_average) ||
      positive(b.vote_count) - positive(a.vote_count) ||
      positive(b.width) - positive(a.width)
  )
  return [...new Set(candidates.map((row) => imagePath(row.file_path)!))].slice(
    0,
    10
  )
}

function normalizeExtras(
  data: Record<string, unknown>,
  mediaType: MediaType
): TitleExtras {
  const creditsKey = mediaType === "movie" ? "credits" : "aggregate_credits"
  const credits = successfulResponse(data[creditsKey]) ? data[creditsKey] : {}
  const alternatives = successfulResponse(data.alternative_titles)
    ? data.alternative_titles
    : {}
  const images = successfulResponse(data.images) ? data.images : {}
  const displayName = boundedText(
    mediaType === "movie" ? data.title : data.name,
    300
  )
  const original = boundedText(
    mediaType === "movie" ? data.original_title : data.original_name,
    300
  )
  const aliases: string[] = []
  const seenAliases = new Set([displayName.toLocaleLowerCase("en-US")])
  const addAlias = (value: unknown) => {
    const alias = boundedText(value, 300)
    const key = alias.toLocaleLowerCase("en-US")
    if (!alias || seenAliases.has(key) || aliases.length === 50) return
    seenAliases.add(key)
    aliases.push(alias)
  }
  addAlias(original)
  for (const row of records(
    alternatives[mediaType === "movie" ? "titles" : "results"]
  ))
    addAlias(row.title)

  const countries = new Map<string, { code: string; name: string }>()
  for (const row of records(data.production_countries)) {
    const code =
      typeof row.iso_3166_1 === "string" ? row.iso_3166_1.toUpperCase() : ""
    const name = boundedText(row.name)
    if (
      !/^[A-Z]{2}$/.test(code) ||
      !name ||
      countries.has(code) ||
      countries.size === 50
    )
      continue
    countries.set(code, { code, name })
  }
  // TV origin countries may be present without production-country names.
  // Use the code as a truthful fallback rather than an extra configuration fetch.
  for (const code of Array.isArray(data.origin_country)
    ? data.origin_country
    : []) {
    if (
      typeof code === "string" &&
      /^[A-Z]{2}$/.test(code) &&
      !countries.has(code) &&
      countries.size < 50
    ) {
      countries.set(code, { code, name: code })
    }
  }
  return {
    genres: namedEntities(data.genres),
    countries: [...countries.values()],
    companies: namedEntities(data.production_companies),
    alternativeTitles: aliases,
    cast: creditedPeople(credits.cast, true, mediaType === "tv"),
    crew: creditedPeople(credits.crew, false, mediaType === "tv"),
    backdrops: gallery(images.backdrops),
  }
}

function completeAppend(value: unknown, arrays: string[]): boolean {
  return (
    successfulResponse(value) &&
    arrays.every((key) => Array.isArray(value[key]))
  )
}

// Load separately, after the main title opens. Never add these fields to the
// details:v2 payload consumed by schedule/stats, or fetch per-episode stills.
export const titleExtras = action({
  args: { mediaType: mediaTypeValidator, tmdbId: v.number() },
  returns: v.union(titleExtrasValidator, v.null()),
  handler: async (ctx, args): Promise<TitleExtras | null> => {
    if ((await ctx.auth.getUserIdentity()) === null)
      throw new Error("Not signed in")
    validateId(args.tmdbId)
    const cacheKey = `extras:${args.mediaType}:${args.tmdbId}:v2`
    const [cached] = (await ctx.runQuery(internal.tmdb_cache.getBatch, {
      keys: [cacheKey],
    })) as CacheEntry[]
    if (
      cached?.payload != null &&
      Date.now() - cached.fetchedAt < DETAILS_TTL_MS
    ) {
      return cached.payload as TitleExtras
    }
    const creditsKey =
      args.mediaType === "movie" ? "credits" : "aggregate_credits"
    let data: Record<string, unknown>
    try {
      data = await tmdbFetch(`/${args.mediaType}/${args.tmdbId}`, {
        language: "en-US",
        append_to_response: `${creditsKey},alternative_titles,images`,
        include_image_language: "en,null",
      })
    } catch (error) {
      if (error instanceof TmdbHttpError && error.status === 404) return null
      throw error
    }
    if (
      !successfulResponse(data) ||
      data.id !== args.tmdbId ||
      (data.media_type !== undefined && data.media_type !== args.mediaType) ||
      (data.adult !== undefined && typeof data.adult !== "boolean")
    ) {
      throw new Error("Invalid TMDB extras response")
    }
    if (data.adult === true) return null
    if (!boundedText(args.mediaType === "movie" ? data.title : data.name)) {
      throw new Error("Invalid TMDB extras response")
    }
    if (!completeAppend(data[creditsKey], ["cast", "crew"])) {
      throw new Error(`Incomplete TMDB extras response: ${creditsKey}`)
    }
    if (
      !completeAppend(data.alternative_titles, [
        args.mediaType === "movie" ? "titles" : "results",
      ])
    ) {
      throw new Error("Incomplete TMDB extras response: alternative_titles")
    }
    if (!completeAppend(data.images, ["backdrops"])) {
      throw new Error("Incomplete TMDB extras response: images")
    }
    const payload = normalizeExtras(data, args.mediaType)
    // Oversized extras must retain all credits without replacing the cache.
    if (
      new TextEncoder().encode(JSON.stringify(payload)).byteLength <= 700_000
    ) {
      await ctx.runMutation(internal.tmdb_cache.putBatch, {
        entries: [{ key: cacheKey, payload, fetchedAt: Date.now() }],
      })
    }
    return payload
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

const cataloguePageValidator = v.object({
  items: v.array(searchResultValidator),
  hasMore: v.boolean(),
})
type CataloguePage = Infer<typeof cataloguePageValidator>
type MediaType = "movie" | "tv"

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function validateId(id: number) {
  if (!positiveId(id)) throw new Error("Invalid TMDB ID")
}

function validatePage(page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 500) {
    throw new Error("Invalid page (expected 1..500)")
  }
  return page
}

function boundedText(value: unknown, limit = 200): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : ""
}

function imagePath(value: unknown): string | null {
  return typeof value === "string" &&
    value.length <= 200 &&
    /^\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(value)
    ? value
    : null
}

function dateOf(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ""
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
    ? value
    : ""
}

function catalogueItem(
  raw: unknown,
  inferredType?: MediaType
): SearchResultPayload | null {
  if (!isRecord(raw) || !positiveId(raw.id)) return null
  const mediaType = raw.media_type === undefined ? inferredType : raw.media_type
  if (
    (mediaType !== "movie" && mediaType !== "tv") ||
    (inferredType !== undefined && mediaType !== inferredType) ||
    (raw.adult !== undefined && raw.adult !== false)
  )
    return null
  const title = boundedText(mediaType === "movie" ? raw.title : raw.name, 300)
  if (!title) return null
  const date = dateOf(
    mediaType === "movie" ? raw.release_date : raw.first_air_date
  )
  return {
    tmdbId: raw.id,
    mediaType,
    title,
    posterPath: imagePath(raw.poster_path),
    year: date ? date.slice(0, 4) : null,
  }
}

function successfulResponse(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    (value.success === undefined || value.success === true) &&
    (value.status_code === undefined || value.status_code === 1)
  )
}

function cataloguePage(
  data: unknown,
  mediaType: MediaType,
  page: number
): CataloguePage {
  if (!successfulResponse(data) || !Array.isArray(data.results)) {
    throw new Error("Invalid TMDB catalogue response")
  }
  const items: SearchResultPayload[] = []
  const seen = new Set<number>()
  // TMDB pages contain at most 20 titles; also bound malformed upstream pages.
  for (const raw of data.results) {
    const item = catalogueItem(raw, mediaType)
    if (!item || seen.has(item.tmdbId)) continue
    seen.add(item.tmdbId)
    items.push(item)
    if (items.length === 20) break
  }
  const totalPages =
    typeof data.total_pages === "number" && Number.isFinite(data.total_pages)
      ? Math.max(0, Math.min(Math.floor(data.total_pages), 500))
      : page
  return { items, hasMore: page < totalPages }
}

// Native TMDB recommendations. Page/version are part of the key so legacy
// array payloads can never be mistaken for the new pagination envelope.
export const recommendations = action({
  args: {
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    page: v.optional(v.number()),
  },
  returns: cataloguePageValidator,
  handler: async (ctx, args): Promise<CataloguePage> => {
    if ((await ctx.auth.getUserIdentity()) === null)
      throw new Error("Not signed in")
    validateId(args.tmdbId)
    const page = validatePage(args.page)
    const cacheKey = `recs:${args.mediaType}:${args.tmdbId}:${page}:v2`
    const [cached] = (await ctx.runQuery(internal.tmdb_cache.getBatch, {
      keys: [cacheKey],
    })) as CacheEntry[]
    if (
      cached?.payload != null &&
      Date.now() - cached.fetchedAt < RECOMMENDATIONS_TTL_MS
    ) {
      return cached.payload as CataloguePage
    }
    const data = await tmdbFetch(
      `/${args.mediaType}/${args.tmdbId}/recommendations`,
      { language: "en-US", page: String(page) }
    )
    const payload = cataloguePage(data, args.mediaType, page)
    await ctx.runMutation(internal.tmdb_cache.putBatch, {
      entries: [{ key: cacheKey, payload, fetchedAt: Date.now() }],
    })
    return payload
  },
})

type PersonCredit = {
  item: SearchResultPayload
  popularity: number
  date: string
  cast: boolean
  crew: boolean
}
const PERSON_CREDITS_TTL_MS = 24 * 60 * 60 * 1000

function personCredits(data: Record<string, unknown>): PersonCredit[] {
  const credits = new Map<string, PersonCredit>()
  for (const kind of ["cast", "crew"] as const) {
    for (const raw of records(data[kind])) {
      // Unlike discover, combined_credits MUST identify each row's type.
      const item = catalogueItem(raw)
      if (!item) continue
      const key = `${item.mediaType}:${item.tmdbId}`
      const popularity =
        typeof raw.popularity === "number" && Number.isFinite(raw.popularity)
          ? Math.max(0, raw.popularity)
          : 0
      const date = dateOf(
        item.mediaType === "movie" ? raw.release_date : raw.first_air_date
      )
      const existing = credits.get(key)
      if (existing) {
        existing[kind] = true
        existing.popularity = Math.max(existing.popularity, popularity)
        if (!existing.date && date) {
          existing.date = date
          existing.item.year = date.slice(0, 4)
        }
      } else {
        credits.set(key, {
          item,
          popularity,
          date,
          cast: kind === "cast",
          crew: kind === "crew",
        })
      }
    }
  }
  return [...credits.values()]
}

export const entitySearch = action({
  args: {
    kind: v.union(
      v.literal("genre"),
      v.literal("country"),
      v.literal("company"),
      v.literal("person")
    ),
    id: v.string(),
    mediaType: v.union(v.literal("all"), mediaTypeValidator),
    credit: v.optional(v.union(v.literal("cast"), v.literal("crew"))),
    sort: v.union(v.literal("popularity"), v.literal("newest")),
    order: v.optional(sortOrderValidator),
    page: v.optional(v.number()),
  },
  returns: cataloguePageValidator,
  handler: async (ctx, args): Promise<CataloguePage> => {
    if ((await ctx.auth.getUserIdentity()) === null)
      throw new Error("Not signed in")
    const page = validatePage(args.page)
    const id = args.kind === "country" ? args.id.toUpperCase() : args.id
    if (args.kind === "country") {
      if (!/^[A-Za-z]{2}$/.test(args.id))
        throw new Error("Invalid country code")
    } else if (!/^[1-9]\d{0,15}$/.test(id) || !positiveId(Number(id))) {
      throw new Error("Invalid entity ID")
    }
    if (args.kind === "genre" && args.mediaType === "all") {
      throw new Error("Genre search requires movie or tv")
    }
    if (args.credit !== undefined && args.kind !== "person") {
      throw new Error("Credit filter requires a person")
    }
    const order = args.order ?? "desc"

    if (args.kind === "person") {
      // TV discover does not support with_people/with_cast/with_crew. One
      // combined_credits request covers both media types and every local page.
      const cacheKey = `person-credits:${id}:v1`
      const [cached] = (await ctx.runQuery(internal.tmdb_cache.getBatch, {
        keys: [cacheKey],
      })) as CacheEntry[]
      let credits: PersonCredit[]
      if (
        cached?.payload != null &&
        Date.now() - cached.fetchedAt < PERSON_CREDITS_TTL_MS
      ) {
        credits = cached.payload as PersonCredit[]
      } else {
        let data: Record<string, unknown>
        try {
          data = await tmdbFetch(`/person/${id}/combined_credits`, {
            language: "en-US",
          })
        } catch (error) {
          if (error instanceof TmdbHttpError && error.status === 404)
            return { items: [], hasMore: false }
          throw error
        }
        if (!successfulResponse(data) || data.id !== Number(id)) {
          throw new Error("Invalid TMDB person credits response")
        }
        credits = personCredits(data)
        // Do not truncate a prolific person's filmography just to cache it.
        // Oversized responses still paginate correctly, but bypass storage.
        if (
          completeAppend(data, ["cast", "crew"]) &&
          credits.length <= 1000 &&
          new TextEncoder().encode(JSON.stringify(credits)).byteLength <=
            700_000
        ) {
          await ctx.runMutation(internal.tmdb_cache.putBatch, {
            entries: [
              { key: cacheKey, payload: credits, fetchedAt: Date.now() },
            ],
          })
        }
      }
      const selected = credits.filter(
        (row) =>
          (args.mediaType === "all" || row.item.mediaType === args.mediaType) &&
          (args.credit === undefined || row[args.credit])
      )
      const direction = order === "asc" ? 1 : -1
      selected.sort((a, b) => {
        const newest =
          !a.date && !b.date
            ? 0
            : !a.date
              ? 1
              : !b.date
                ? -1
                : a.date.localeCompare(b.date) * direction
        const popular = (a.popularity - b.popularity) * direction
        return (
          (args.sort === "newest" ? newest || popular : popular || newest) ||
          b.popularity - a.popularity ||
          a.item.mediaType.localeCompare(b.item.mediaType) ||
          a.item.tmdbId - b.item.tmdbId
        )
      })
      return {
        items: selected
          .slice((page - 1) * 20, page * 20)
          .map((row) => row.item),
        hasMore: page < 500 && page * 20 < selected.length,
      }
    }

    const types: MediaType[] =
      args.mediaType === "all" ? ["movie", "tv"] : [args.mediaType]
    const pages = await Promise.all(
      types.map(async (mediaType) => {
        const filter =
          args.kind === "genre"
            ? "with_genres"
            : args.kind === "company"
              ? "with_companies"
              : "with_origin_country"
        const data = await tmdbFetch(`/discover/${mediaType}`, {
          language: "en-US",
          include_adult: "false",
          page: String(page),
          sort_by:
            args.sort === "popularity"
              ? `popularity.${order}`
              : mediaType === "movie"
                ? `primary_release_date.${order}`
                : `first_air_date.${order}`,
          [filter]: id,
        })
        return cataloguePage(data, mediaType, page)
      })
    )
    const items: SearchResultPayload[] = []
    // Keep each endpoint's sort order while giving both media types room.
    for (
      let i = 0;
      i < Math.max(...pages.map((result) => result.items.length));
      i++
    ) {
      for (const result of pages)
        if (result.items[i]) items.push(result.items[i])
    }
    return { items, hasMore: pages.some((result) => result.hasMore) }
  },
})

// Best YouTube trailer for one title — "Play trailer" in the details
// drawer. Ranking happens server-side so the client gets one answer.
export const videos = action({
  args: { mediaType: mediaTypeValidator, tmdbId: v.number() },
  returns: v.union(v.object({ key: v.string(), name: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const cacheKey = `videos:${args.mediaType}:${args.tmdbId}:v1`
    const [cached] = (await ctx.runQuery(internal.tmdb_cache.getBatch, {
      keys: [cacheKey],
    })) as CacheEntry[]
    if (
      cached?.payload != null &&
      Date.now() - cached.fetchedAt < VIDEOS_TTL_MS
    ) {
      return cached.payload as { key: string; name: string }
    }

    const data = await tmdbFetch(`/${args.mediaType}/${args.tmdbId}/videos`, {
      language: "en-US",
    })
    const raw = (Array.isArray(data.results) ? data.results : []) as Record<
      string,
      unknown
    >[]
    const youtube = raw.filter(
      (r) => r.site === "YouTube" && typeof r.key === "string" && r.key !== ""
    )
    // Official trailers first, then any trailer, teaser, clip; newest first
    // within each bucket.
    const typeRank = (r: Record<string, unknown>) =>
      r.type === "Trailer" ? 0 : r.type === "Teaser" ? 1 : 2
    youtube.sort((a, b) => {
      const official =
        (b.official === true ? 1 : 0) - (a.official === true ? 1 : 0)
      if (official !== 0) return official
      const rank = typeRank(a) - typeRank(b)
      if (rank !== 0) return rank
      return String(b.published_at ?? "").localeCompare(
        String(a.published_at ?? "")
      )
    })
    const best = youtube[0]
    const payload =
      best === undefined
        ? null
        : {
            key: best.key as string,
            name: typeof best.name === "string" ? best.name : "Trailer",
          }

    await ctx.runMutation(internal.tmdb_cache.putBatch, {
      entries: [{ key: cacheKey, payload, fetchedAt: Date.now() }],
    })
    return payload
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
